import React, { useState, useEffect } from 'react';
import { Task, UserProfile, Goal, EisenhowerQuadrant } from '../../types';
import { useTranslation } from '../../utils/translations';
import { getLocalTodayStr, daysUntil, getDeadlineUrgency, formatDeadlineCountdown } from '../../utils/date';
import { Check, Trash2, Clock, Pencil, X, MapPin, Share2, Users, CalendarDays, Timer } from 'lucide-react';
import confetti from 'canvas-confetti';
import { db, auth } from '../../lib/firebase';
import { collection, query, where, onSnapshot, addDoc } from 'firebase/firestore';
import defaultGroupAvatarImg from '../../assets/group-default-avatar.jpg';

interface TasksViewProps {
  user: UserProfile;
  tasks: Task[];
  goals: Goal[];
  onToggleTask: (taskId: string) => void;
  onAddTask: (task: Partial<Task>) => void;
  onUpdateTask: (task: Task) => void;
  onDeleteTask: (taskId: string) => void;
  onNavigateToGoals: () => void;
}

// ข้อมูลกลุ่มแบบย่อ — ใช้แค่แสดงในตัวเลือก "แชร์งานลงกลุ่ม" เท่านั้น
interface ShareableGroup {
  id: string;
  name: string;
  imageUrl?: string;
}

// รูปปกกลุ่มแบบย่อ (ใช้ในตัวเลือก "แชร์งานลงกลุ่ม") — ถ้าโหลดรูปที่บันทึกไว้ไม่ขึ้น
// (ลิงก์เสีย/URL asset รุ่นเก่าที่ใช้ไม่ได้แล้ว) ให้ตกกลับไปแสดงภาพ default ของแอปแทน
const ShareGroupAvatar: React.FC<{ name: string; imageUrl?: string }> = ({ name, imageUrl }) => {
  const [failed, setFailed] = useState(false);
  const showCustom = !!imageUrl && imageUrl.trim() !== '' && !failed;

  return showCustom ? (
    <img src={imageUrl} alt={name} onError={() => setFailed(true)} className="w-full h-full object-cover" />
  ) : (
    <img src={defaultGroupAvatarImg} alt={name} className="w-full h-full object-cover" />
  );
};

export const TasksView: React.FC<TasksViewProps> = ({
  user,
  tasks,
  goals,
  onToggleTask,
  onUpdateTask,
  onDeleteTask,
  onNavigateToGoals
}) => {
  const t = useTranslation(user.language);
  const [activeQuadrant, setActiveQuadrant] = useState<EisenhowerQuadrant>('now');

  // ----------------------------------------------------
  // 📅 ตัวกรองวันที่ของรายการงาน (Date Filter)
  // ----------------------------------------------------
  // 'today'  = แสดงเฉพาะงานของวันนี้ (ค่าเริ่มต้น)
  // 'all'    = แสดงงานทั้งหมด ไม่กรองตามวันที่
  // 'day'    = แสดงเฉพาะงานของวันเดียวที่ผู้ใช้เลือกเอง (ดู customStartDate)
  // 'custom' = แสดงเฉพาะงานในช่วงวันที่ที่ผู้ใช้เลือกเอง (ดู customStartDate / customEndDate)
  type TaskDateFilterMode = 'all' | 'today' | 'day' | 'custom';
  const todayStr = getLocalTodayStr();
  const [dateFilterMode, setDateFilterMode] = useState<TaskDateFilterMode>('today');
  const [customStartDate, setCustomStartDate] = useState<string>(todayStr);
  const [customEndDate, setCustomEndDate] = useState<string>(todayStr);

  // 🏷️ ตัวกรองหมวดหมู่งาน (Category Filter) — ค่าเริ่มต้น 'all' คือไม่กรอง
  // ตัวเลือกหมวดหมู่ที่แสดง จะดึงมาจากค่า category จริงที่มีอยู่ใน Quadrant ที่กำลังเปิดดู
  // (เพราะ Task.category เป็น string อิสระ ไม่ได้ตายตัวเป็น enum ที่แน่นอน)
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // ----------------------------------------------------
  // Edit Task Modal State
  // ----------------------------------------------------
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // ----------------------------------------------------
  // 📅 ย้ายวันที่ของงาน (Move Task Date) — เปิด/ปิดช่องเลือกวันใหม่แบบเร็ว ๆ ในการ์ดงาน
  // ----------------------------------------------------
  const [movingDateTaskId, setMovingDateTaskId] = useState<string | null>(null);
  const [moveDateValue, setMoveDateValue] = useState<string>('');
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editStartTime, setEditStartTime] = useState('09:00');
  const [editEndTime, setEditEndTime] = useState('09:30');
  const [editDurationHours, setEditDurationHours] = useState(0);
  const [editDurationMins, setEditDurationMins] = useState(30);
  const [editQuadrant, setEditQuadrant] = useState<EisenhowerQuadrant>('now');
  const [editGoalId, setEditGoalId] = useState<string>('');
  // 🕒 ไม่ระบุเวลา (Anytime / Flex Task) — เหมือนกับตอนเพิ่มงานใหม่ใน CalendarView
  // (dueTime ว่าง '' และไม่มี endTime)
  const [editIsFlexTime, setEditIsFlexTime] = useState(false);

  // ----------------------------------------------------
  // 📤 แชร์งานลงกลุ่ม (Share Task to Group)
  // ----------------------------------------------------
  const currentUser = auth.currentUser;
  const [myGroups, setMyGroups] = useState<ShareableGroup[]>([]);
  const [sharingTask, setSharingTask] = useState<Task | null>(null);
  const [selectedShareGroupId, setSelectedShareGroupId] = useState<string>('');
  const [isSharingTask, setIsSharingTask] = useState(false);

  // ดึงรายชื่อ "กลุ่มที่เราเป็นสมาชิกอยู่" แบบเรียลไทม์ ใช้แสดงในตัวเลือกตอนแชร์งาน
  useEffect(() => {
    if (!currentUser) {
      setMyGroups([]);
      return;
    }

    const q = query(
      collection(db, 'groups'),
      where('memberIds', 'array-contains', currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedGroups: ShareableGroup[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data() as { name: string; imageUrl?: string };
        return { id: docSnap.id, name: data.name, imageUrl: data.imageUrl };
      });
      setMyGroups(fetchedGroups);
    });

    return () => unsubscribe();
  }, [currentUser?.uid]);

  // แปลงหมวดหมู่ของงานส่วนตัว ให้ตรงกับหมวดหมู่ฝั่งงานกลุ่ม (Study/Work/Personal/Other)
  const mapPersonalCategoryToGroup = (category?: string) => {
    switch ((category || '').toUpperCase()) {
      case 'STUDY': return 'Study';
      case 'WORK': return 'Work';
      case 'PERSONAL': return 'Personal';
      default: return 'Other';
    }
  };

  // แปลง eisenhowerQuadrant ของงานส่วนตัว ให้ตรงกับ Quadrant ฝั่งงานกลุ่ม
  const mapPersonalQuadrantToGroup = (quadrant: EisenhowerQuadrant) => {
    switch (quadrant) {
      case 'now': return 'Do Now (Urgent & Imp';
      case 'plan': return 'Schedule (Not Urgent & Imp)';
      case 'quick': return 'Delegate (Urgent & Not Imp)';
      case 'chill': return 'Eliminate (Not Urgent & Not Imp)';
      case 'deadline': return 'Deadline (มีกำหนดส่ง)';
      default: return 'Do Now (Urgent & Imp';
    }
  };

  const openShareModal = (task: Task) => {
    setSharingTask(task);
    setSelectedShareGroupId(myGroups[0]?.id || '');
  };

  const closeShareModal = () => {
    setSharingTask(null);
    setSelectedShareGroupId('');
  };

  const handleConfirmShareTask = async () => {
    if (!sharingTask || !selectedShareGroupId || !currentUser) return;
    setIsSharingTask(true);
    try {
      const noTimeLimit = !sharingTask.dueTime;
      const durationMinutes = sharingTask.durationMinutes || 0;

      await addDoc(collection(db, 'groupTasks'), {
        groupId: selectedShareGroupId,
        title: sharingTask.title,
        description: sharingTask.description || '',
        category: mapPersonalCategoryToGroup(sharingTask.category),
        quadrant: mapPersonalQuadrantToGroup(sharingTask.eisenhowerQuadrant),
        noTimeLimit,
        startTime: noTimeLimit ? '' : sharingTask.dueTime,
        endTime: noTimeLimit ? '' : (sharingTask.endTime || ''),
        durationHrs: Math.floor(durationMinutes / 60),
        durationMins: durationMinutes % 60,
        location: sharingTask.location || '',
        dueDate: sharingTask.dueDate,
        sharedBy: currentUser.displayName || currentUser.email?.split('@')[0] || 'สมาชิกในกลุ่ม',
        creatorId: currentUser.uid,
        responses: {}
      });

      closeShareModal();
    } catch (error) {
      console.error('Error sharing task to group:', error);
      alert('เกิดข้อผิดพลาดในการแชร์งานลงกลุ่ม กรุณาลองใหม่');
    } finally {
      setIsSharingTask(false);
    }
  };

  // 🔹 แปลงเวลา "HH:mm" <-> จำนวนนาที ใช้ผูก Start/End Time กับ Duration
  const timeToMinutes = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };

  const minutesToTime = (totalMinutes: number) => {
    const clamped = ((totalMinutes % 1440) + 1440) % 1440;
    const h = Math.floor(clamped / 60);
    const m = clamped % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  };

  const openEditModal = (task: Task) => {
    setEditingTask(task);
    setEditTitle(task.title);
    setEditDescription(task.description || '');
    setEditLocation(task.location || '');
    const duration = task.durationMinutes || 0;
    setEditDurationHours(Math.floor(duration / 60));
    setEditDurationMins(duration % 60);
    const start = task.dueTime || '09:00';
    setEditStartTime(start);
    setEditEndTime(task.endTime || minutesToTime(timeToMinutes(start) + duration));
    setEditQuadrant(task.eisenhowerQuadrant);
    setEditGoalId(task.goalId || '');
    // งานที่ไม่มี dueTime อยู่แล้ว (มาจาก Flex Task หรือ Flex Habit) ให้เปิดโหมด "ไม่ระบุเวลา" ไว้ตั้งแต่แรก
    setEditIsFlexTime(!task.dueTime);
  };

  const closeEditModal = () => {
    setEditingTask(null);
  };

  // 🔹 เปิด/ปิดช่องเลือกวันใหม่สำหรับงานที่ต้องการย้ายวัน
  const openMoveDate = (task: Task) => {
    setMovingDateTaskId((prev) => (prev === task.id ? null : task.id));
    setMoveDateValue(task.dueDate);
  };

  const closeMoveDate = () => {
    setMovingDateTaskId(null);
    setMoveDateValue('');
  };

  // 🔹 ยืนยันการย้ายวันที่ของงาน
  const handleConfirmMoveDate = (task: Task) => {
    if (!moveDateValue || moveDateValue === task.dueDate) {
      closeMoveDate();
      return;
    }
    onUpdateTask({
      ...task,
      dueDate: moveDateValue,
      updatedAt: new Date().toISOString()
    });
    closeMoveDate();
  };

  // 🔹 เปลี่ยน Start Time -> คำนวณ End Time ใหม่โดยคง Duration เดิมไว้
  const handleEditStartTimeChange = (value: string) => {
    setEditStartTime(value);
    const durationMinutes = Number(editDurationHours) * 60 + Number(editDurationMins);
    setEditEndTime(minutesToTime(timeToMinutes(value) + durationMinutes));
  };

  // 🔹 เปลี่ยน End Time -> คำนวณ Duration ใหม่จากส่วนต่างของเวลา
  const handleEditEndTimeChange = (value: string) => {
    setEditEndTime(value);
    let diff = timeToMinutes(value) - timeToMinutes(editStartTime);
    if (diff < 0) diff += 1440;
    setEditDurationHours(Math.floor(diff / 60));
    setEditDurationMins(diff % 60);
  };

  // 🔹 เปลี่ยน Duration (ชม./นาที) -> คำนวณ End Time ใหม่
  const handleEditDurationHoursChange = (hours: number) => {
    setEditDurationHours(hours);
    const totalMinutes = hours * 60 + Number(editDurationMins);
    setEditEndTime(minutesToTime(timeToMinutes(editStartTime) + totalMinutes));
  };

  const handleEditDurationMinsChange = (mins: number) => {
    setEditDurationMins(mins);
    const totalMinutes = Number(editDurationHours) * 60 + mins;
    setEditEndTime(minutesToTime(timeToMinutes(editStartTime) + totalMinutes));
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTask) return;

    onUpdateTask({
      ...editingTask,
      title: editTitle.trim() || editingTask.title,
      description: editDescription.trim() || undefined,
      location: editLocation.trim() || undefined,
      // ไม่ระบุเวลา ➔ dueTime ว่าง '' และไม่มี endTime (เหมือนตอนเพิ่มงานใหม่)
      dueTime: editIsFlexTime ? '' : editStartTime,
      endTime: editIsFlexTime ? undefined : editEndTime,
      durationMinutes: editDurationHours * 60 + editDurationMins,
      eisenhowerQuadrant: editQuadrant,
      goalId: editGoalId || undefined,
      updatedAt: new Date().toISOString()
    });

    closeEditModal();
  };

  const quadrants: Array<{
    id: EisenhowerQuadrant;
    title: string;
    sub: string;
    icon: string;
  }> = [
    {
      id: 'now',
      title: 'ด่วน & สำคัญ (ทำทันที)',
      sub: 'งานด่วนและสำคัญมาก',
      icon: '⚡'
    },
    {
      id: 'plan',
      title: 'วางแผน (มีตารางเวลา)',
      sub: 'ไม่ด่วน แต่สำคัญกับเป้าหมาย',
      icon: '🗓️'
    },
    {
      id: 'quick',
      title: 'งานไว / มอบหมาย',
      sub: 'ด่วน แต่ง่ายหรือให้คนอื่นช่วยได้',
      icon: '⚡'
    },
    {
      id: 'chill',
      title: 'ผ่อนคลาย (ไม่เร่งรีบ)',
      sub: 'งานไม่ด่วน ไม่สำคัญ พักผ่อนได้',
      icon: '🛋️'
    }
  ];

  // ⏰ งานที่มีกำหนดส่ง (Deadline Task) — แยกออกจาก 4 Quadrant ปกติ แสดงเป็นการ์ดพิเศษ
  // เต็มความกว้าง ด้านล่างกริด เพราะสิ่งที่สำคัญที่สุดคือ "เหลือเวลาอีกกี่วัน" ไม่ใช่ Quadrant
  const deadlineQuadrant = {
    id: 'deadline' as EisenhowerQuadrant,
    title: 'งานที่มีกำหนดส่ง',
    sub: 'นับถอยหลังถึงวันครบกำหนด',
    icon: '⏰'
  };

  // งานกำหนดส่งที่ยังไม่เสร็จทั้งหมด (ไม่กรองตาม dateFilterMode เพราะกำหนดส่งอาจอยู่ในอนาคต)
  const pendingDeadlineTasks = tasks.filter((t) => t.eisenhowerQuadrant === 'deadline' && !t.completed);
  const overdueDeadlineCount = pendingDeadlineTasks.filter((t) => daysUntil(t.dueDate) < 0).length;

  // หมวดหมู่ที่มีอยู่จริงใน Quadrant ปัจจุบัน ใช้เป็นตัวเลือกในตัวกรองหมวดหมู่
  const categoryOptions = Array.from(
    new Set(
      tasks
        .filter((task) => task.eisenhowerQuadrant === activeQuadrant)
        .map((task) => task.category)
        .filter((c): c is string => !!c)
    )
  ).sort();

  // กันพัง: ถ้าหมวดหมู่ที่เคยเลือกไว้ไม่มีอยู่ใน Quadrant ปัจจุบันแล้ว (เช่น ถูกลบ/สลับแท็บ)
  // ให้ถือว่าไม่กรอง ('all') แทน โดยไม่ต้องพึ่ง useEffect
  const effectiveCategoryFilter = categoryOptions.includes(categoryFilter) ? categoryFilter : 'all';

  // กันพัง: ถ้าผู้ใช้เลือกวันเริ่มต้นมาทีหลังวันสิ้นสุด ให้สลับกันเอง (Effective Range)
  const effectiveRangeStart = customStartDate <= customEndDate ? customStartDate : customEndDate;
  const effectiveRangeEnd = customStartDate <= customEndDate ? customEndDate : customStartDate;

  // กรองตาม Quadrant ที่เลือก + หมวดหมู่ + ตัวกรองวันที่ (ทั้งหมด / วันนี้ / ช่วงวันที่ระบุเอง)
  const filteredTasksUnsorted = tasks.filter((task) => {
    if (task.eisenhowerQuadrant !== activeQuadrant) return false;
    if (effectiveCategoryFilter !== 'all' && task.category !== effectiveCategoryFilter) return false;
    if (dateFilterMode === 'today') return task.dueDate === todayStr;
    if (dateFilterMode === 'day') return task.dueDate === customStartDate;
    if (dateFilterMode === 'custom') return task.dueDate >= effectiveRangeStart && task.dueDate <= effectiveRangeEnd;
    return true; // 'all' ➔ ไม่กรองตามวันที่
  });

  // 🔽 เรียงงานที่มีกำหนดส่งตาม "ใกล้ครบกำหนดที่สุดก่อน" เพื่อให้เห็นงานเร่งด่วนอยู่บนสุด
  const filteredTasks = activeQuadrant === 'deadline'
    ? [...filteredTasksUnsorted].sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    : filteredTasksUnsorted;

  // เป้าหมายที่ถูกเลือก (ปักหมุด) ให้แสดงบนหน้านี้
  const featuredGoal = goals.find((g) => g.isPinned && !g.completed);

  const handleCheck = (taskId: string, currentCompleted: boolean) => {
    onToggleTask(taskId);
    if (!currentCompleted) {
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.5 }
      });
    }
  };

  return (
    <div className="pb-24 pt-2 px-4 max-w-md mx-auto space-y-4">
      {/* Target / Goals Banner */}
      <div className="bg-accent doodle-border doodle-shadow p-4 relative flex justify-between items-center">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold tracking-tight text-[var(--text-main)]">
            เป้าหมาย
          </h2>
          {featuredGoal ? (
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-base shrink-0">{featuredGoal.categoryIcon || '🎯'}</span>
              <p className="text-xs font-semibold text-gray-800 truncate">
                {featuredGoal.title}
              </p>
            </div>
          ) : (
            <p className="text-xs font-semibold text-gray-800 mt-1">
              ยังไม่มีเป้าหมายตอนนี้
            </p>
          )}
        </div>
        <button
          onClick={onNavigateToGoals}
          className="bg-white doodle-border-pill doodle-shadow-sm doodle-btn px-3.5 py-1.5 text-xs font-bold flex items-center gap-1.5 shrink-0"
        >
          <span className="text-sm">🎯</span> Goals
        </button>
      </div>

      {/* 4 Eisenhower Quadrants */}
      <div className="grid grid-cols-2 gap-3">
        {quadrants.map((q) => {
          const count = tasks.filter(t => {
            if (t.eisenhowerQuadrant !== q.id || t.completed) return false;
            // ตัวกรองหมวดหมู่ผูกกับ Quadrant ที่กำลังเปิดดูอยู่เท่านั้น จึงใช้กรองแค่กับ q.id
            // ที่ตรงกับ activeQuadrant เพื่อไม่ให้ตัวเลขของ Quadrant อื่นเพี้ยนไปตามหมวดหมู่ที่เลือก
            if (q.id === activeQuadrant && effectiveCategoryFilter !== 'all' && t.category !== effectiveCategoryFilter) return false;
            if (dateFilterMode === 'today') return t.dueDate === todayStr;
            if (dateFilterMode === 'day') return t.dueDate === customStartDate;
            if (dateFilterMode === 'custom') return t.dueDate >= effectiveRangeStart && t.dueDate <= effectiveRangeEnd;
            return true;
          }).length;
          const isSelected = activeQuadrant === q.id;
          return (
            <button
              key={q.id}
              onClick={() => {
                setActiveQuadrant(q.id);
                setCategoryFilter('all'); // สลับ Quadrant ➔ รีเซ็ตตัวกรองหมวดหมู่ (หมวดหมู่ผูกกับ Quadrant)
              }}
              className={`doodle-border doodle-shadow doodle-btn p-2.5 relative flex flex-col justify-between gap-1.5 text-left transition-colors ${
                isSelected ? 'bg-accent' : 'bg-white'
              }`}
            >
              <div className="flex justify-between items-start w-full">
                <span className="text-base">{q.icon}</span>
                <span className="border border-black rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold bg-white">
                  {count}
                </span>
              </div>
              <div>
                <h3 className="font-bold text-[11px] leading-tight text-[var(--text-main)]">
                  {q.title}
                </h3>
                <p className={`text-[9px] mt-0.5 font-medium leading-tight ${
                  isSelected ? 'text-gray-800' : 'text-gray-400'
                }`}>
                  {q.sub}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* ⏰ Deadline Task Tile — การ์ดพิเศษเต็มความกว้าง แยกจากกริด Quadrant 2x2 */}
      <button
        onClick={() => {
          setActiveQuadrant('deadline');
          setCategoryFilter('all');
          // งานกำหนดส่งมักอยู่ในอนาคต ไม่ใช่วันนี้เสมอไป ➔ สลับตัวกรองวันที่เป็น "ทั้งหมด" ให้อัตโนมัติ
          setDateFilterMode('all');
        }}
        className={`w-full doodle-border doodle-shadow doodle-btn p-3.5 flex items-center gap-3 text-left transition-colors ${
          activeQuadrant === 'deadline'
            ? 'bg-[#FF9F9F]'
            : overdueDeadlineCount > 0
            ? 'bg-[#FFE0E0]'
            : 'bg-white'
        }`}
      >
        <span className="text-2xl shrink-0">{deadlineQuadrant.icon}</span>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-xs leading-tight text-[var(--text-main)]">
            {deadlineQuadrant.title}
          </h3>
          <p className={`text-[10px] mt-0.5 font-medium leading-tight ${
            activeQuadrant === 'deadline' ? 'text-gray-800' : 'text-gray-400'
          }`}>
            {deadlineQuadrant.sub}
          </p>
        </div>
        {overdueDeadlineCount > 0 && (
          <span className="text-[10px] font-black bg-[#FF4D4D] text-white px-2 py-0.5 rounded-full border border-black shrink-0">
            {user.language === 'th' ? `เลยกำหนด ${overdueDeadlineCount}` : `${overdueDeadlineCount} overdue`}
          </span>
        )}
        <span className="border border-black rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold bg-white shrink-0">
          {pendingDeadlineTasks.length}
        </span>
      </button>

      {/* Task List Header + Filters (หมวดหมู่ / ทั้งหมด-วันนี้-เลือกวันที่) */}
      <div className="pt-2 flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-bold text-sm text-[var(--text-main)]">
          {filteredTasks.length} tasks
        </h3>

        <div className="flex items-center gap-2 flex-wrap">
          {categoryOptions.length > 0 && (
            <select
              value={effectiveCategoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="doodle-input text-[10px] font-bold px-2 py-1"
            >
              <option value="all">{user.language === 'th' ? 'ทุกหมวดหมู่' : 'All categories'}</option>
              {categoryOptions.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          )}

          <div className="flex bg-white doodle-border-pill doodle-shadow-sm p-0.5 gap-0.5 shrink-0">
            {(['today', 'all', 'day', 'custom'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setDateFilterMode(mode)}
                className={`doodle-btn px-2.5 py-1 rounded-full text-[10px] font-bold transition-colors ${
                  dateFilterMode === mode ? 'bg-accent text-[#1A1A1A]' : 'text-gray-400'
                }`}
              >
                {mode === 'today'
                  ? (user.language === 'th' ? 'วันนี้' : 'Today')
                  : mode === 'all'
                  ? (user.language === 'th' ? 'ทั้งหมด' : 'All')
                  : mode === 'day'
                  ? (user.language === 'th' ? 'เลือกวัน' : 'Pick date')
                  : (user.language === 'th' ? 'เลือกช่วงเวลา' : 'Date range')}
              </button>
            ))}
          </div>

          {dateFilterMode === 'day' && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="doodle-input text-[11px] font-bold px-2 py-1"
                aria-label={user.language === 'th' ? 'เลือกวัน' : 'Pick date'}
              />
            </div>
          )}

          {dateFilterMode === 'custom' && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="doodle-input text-[11px] font-bold px-2 py-1"
                aria-label={user.language === 'th' ? 'วันที่เริ่มต้น' : 'Start date'}
              />
              <span className="text-[10px] font-bold text-gray-400">
                {user.language === 'th' ? 'ถึง' : 'to'}
              </span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="doodle-input text-[11px] font-bold px-2 py-1"
                aria-label={user.language === 'th' ? 'วันที่สิ้นสุด' : 'End date'}
              />
            </div>
          )}
        </div>
      </div>

      {/* Empty State / Task Items */}
      <div className="space-y-3">
        {filteredTasks.length === 0 ? (
          <div className="bg-white doodle-border doodle-shadow p-8 text-center min-h-[170px] flex flex-col items-center justify-center space-y-3">
            <span className="text-3xl text-amber-400">✦</span>
            <p className="font-bold text-[var(--text-main)] text-sm leading-relaxed px-4">
              No tasks in this priority! Enjoy the clarity.
            </p>
          </div>
        ) : (
          filteredTasks.map((task) => {
            const linkedGoal = goals.find(g => g.id === task.goalId);
            // ⏰ ข้อมูลตัวนับถอยหลังสำหรับงานที่มีกำหนดส่งเท่านั้น
            const isDeadlineTask = task.eisenhowerQuadrant === 'deadline';
            const deadlineDaysLeft = isDeadlineTask ? daysUntil(task.dueDate) : null;
            const deadlineUrgency = deadlineDaysLeft !== null ? getDeadlineUrgency(deadlineDaysLeft) : null;
            const deadlineAccentColor =
              deadlineUrgency === 'overdue' ? '#FF4D4D' :
              deadlineUrgency === 'today' ? '#FF9F5A' :
              deadlineUrgency === 'soon' ? '#FFE66D' : '#9DD9D2';
            return (
              <div
                key={task.id}
                className={`bg-white doodle-border doodle-shadow p-3.5 relative transition-all overflow-hidden ${
                  task.completed ? 'opacity-60 bg-gray-50' : ''
                } ${isDeadlineTask && !task.completed && deadlineUrgency === 'overdue' ? 'bg-red-50' : ''}`}
              >
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => handleCheck(task.id, task.completed)}
                    className={`w-5 h-5 doodle-border-sm shrink-0 mt-0.5 flex items-center justify-center transition-colors ${
                      task.completed ? 'bg-[var(--ink-solid)] text-white' : 'bg-white hover:bg-gray-100'
                    }`}
                  >
                    {task.completed && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-2">
                      <h4 className={`text-sm font-bold leading-snug line-clamp-2 ${
                        task.completed ? 'line-through text-gray-400' : 'text-[var(--text-main)]'
                      }`}>
                        {task.title}
                      </h4>
                      <div className="flex items-center gap-1 shrink-0">
                        {myGroups.length > 0 && (
                          <button
                            onClick={() => openShareModal(task)}
                            className="text-gray-400 hover:text-green-600 p-0.5"
                            title={user.language === 'th' ? 'แชร์งานลงกลุ่ม' : 'Share to group'}
                          >
                            <Share2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => openMoveDate(task)}
                          className={`p-0.5 ${movingDateTaskId === task.id ? 'text-amber-500' : 'text-gray-400 hover:text-amber-500'}`}
                          title={user.language === 'th' ? 'ย้ายวัน' : 'Move date'}
                        >
                          <CalendarDays className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => openEditModal(task)}
                          className="text-gray-400 hover:text-blue-500 p-0.5"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onDeleteTask(task.id)}
                          className="text-gray-400 hover:text-red-500 p-0.5"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* ⏰ Badge นับถอยหลังวันครบกำหนดส่ง — เฉพาะงานประเภท Deadline */}
                    {isDeadlineTask && deadlineDaysLeft !== null && (
                      <div
                        className="mt-1 inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full border border-black w-fit"
                        style={{ backgroundColor: task.completed ? '#E5E7EB' : deadlineAccentColor }}
                      >
                        <Timer className="w-3 h-3" />
                        {formatDeadlineCountdown(deadlineDaysLeft, user.language)}
                        <span className="font-normal">· {task.dueDate}</span>
                      </div>
                    )}

                    {/* 📅 ช่องเลือกวันใหม่แบบเร็ว ๆ (เปิดเมื่อกดปุ่มย้ายวัน) */}
                    {movingDateTaskId === task.id && (
                      <div className="mt-2 flex items-center gap-1.5 flex-wrap bg-amber-50 doodle-border-sm px-2 py-1.5">
                        <input
                          type="date"
                          value={moveDateValue}
                          onChange={(e) => setMoveDateValue(e.target.value)}
                          className="doodle-input text-[11px] font-bold px-2 py-1 flex-1 min-w-[120px]"
                          aria-label={user.language === 'th' ? 'เลือกวันใหม่' : 'New date'}
                        />
                        <button
                          type="button"
                          onClick={() => handleConfirmMoveDate(task)}
                          className="bg-accent doodle-border-sm doodle-btn px-2.5 py-1 text-[10px] font-black"
                        >
                          {user.language === 'th' ? 'ย้าย' : 'Move'}
                        </button>
                        <button
                          type="button"
                          onClick={closeMoveDate}
                          className="bg-white doodle-border-sm doodle-btn px-2 py-1 text-[10px] font-bold text-gray-500"
                        >
                          {t.cancel}
                        </button>
                      </div>
                    )}

                    {task.description && (
                      <p className={`text-[11px] font-normal leading-snug line-clamp-2 mt-0.5 ${
                        task.completed ? 'text-gray-400' : 'text-gray-500'
                      }`}>
                        {task.description}
                      </p>
                    )}

                    {task.location && (
                      <p className={`text-[11px] font-normal leading-snug line-clamp-1 mt-0.5 flex items-center gap-1 ${
                        task.completed ? 'text-gray-400' : 'text-gray-500'
                      }`}>
                        <MapPin className="w-3 h-3 shrink-0" />
                        {task.location}
                      </p>
                    )}

                    <div className="flex items-center justify-between mt-2 pt-1 border-t border-dashed border-gray-200">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {linkedGoal && (
                          <span className="text-[10px] font-bold bg-[#E6D4F9] px-2 py-0.5 rounded-full border border-black flex items-center gap-1">
                            <span>{linkedGoal.categoryIcon}</span>
                            <span className="max-w-[90px] truncate">{linkedGoal.title}</span>
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] font-bold text-gray-600 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>{task.durationMinutes}m</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ✏️ Edit Task Modal */}
      {editingTask && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white doodle-border doodle-shadow-lg max-w-md w-full p-5 space-y-4">
            <div className="flex justify-between items-center border-b-2 border-black pb-2">
              <h3 className="font-extrabold text-lg font-['Bricolage_Grotesque']">
                {t.editTask || 'Edit Task'}
              </h3>
              <button
                type="button"
                onClick={closeEditModal}
                className="p-1 hover:bg-gray-100 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3 text-xs font-bold">
              <div>
                <label className="block mb-1 text-gray-700">{t.taskTitle}</label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 doodle-border-sm bg-white focus:outline-none focus:bg-amber-50"
                />
              </div>

              <div>
                <label className="block mb-1 text-gray-700">{t.taskDescription}</label>
                <input
                  type="text"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder={t.taskDescriptionPlaceholder}
                  className="w-full px-3 py-2 doodle-border-sm bg-white focus:outline-none focus:bg-amber-50 font-normal"
                />
              </div>

              <div className="flex items-center justify-between gap-2 doodle-border-sm bg-gray-50 px-3 py-2">
                <label htmlFor="edit-task-flex-time" className="text-gray-700">
                  {user.language === 'th' ? 'ไม่ระบุเวลา' : 'No specific time'}
                </label>
                <button
                  type="button"
                  id="edit-task-flex-time"
                  onClick={() => setEditIsFlexTime((prev) => !prev)}
                  className={`shrink-0 w-9 h-5 rounded-full doodle-btn transition-colors relative ${
                    editIsFlexTime ? 'bg-accent' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white border border-black transition-transform ${
                      editIsFlexTime ? 'translate-x-4' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>

              {!editIsFlexTime && (
                <div className="flex flex-wrap gap-2">
                  <div className="flex-1 min-w-[132px]">
                    <label className="block mb-1 text-gray-700">Start Time</label>
                    <input
                      type="time"
                      value={editStartTime}
                      onChange={(e) => handleEditStartTimeChange(e.target.value)}
                      className="doodle-time-input doodle-border-sm bg-white"
                    />
                  </div>

                  <div className="flex-1 min-w-[132px]">
                    <label className="block mb-1 text-gray-700">End Time</label>
                    <input
                      type="time"
                      value={editEndTime}
                      onChange={(e) => handleEditEndTimeChange(e.target.value)}
                      className="doodle-time-input doodle-border-sm bg-white"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block mb-1 text-gray-700">Duration</label>
                  <div className="flex gap-1 items-center">
                    <div className="flex-1">
                      <input
                        type="number"
                        min="0"
                        max="24"
                        value={editDurationHours}
                        onChange={(e) => handleEditDurationHoursChange(Math.max(0, Number(e.target.value)))}
                        className="w-full px-2 py-2 doodle-border-sm bg-white text-center font-bold"
                      />
                      <span className="text-[10px] text-gray-500 block text-center mt-0.5">hrs</span>
                    </div>
                    <span className="font-bold">:</span>
                    <div className="flex-1">
                      <input
                        type="number"
                        min="0"
                        max="59"
                        step="5"
                        value={editDurationMins}
                        onChange={(e) => handleEditDurationMinsChange(Math.max(0, Number(e.target.value)))}
                        className="w-full px-2 py-2 doodle-border-sm bg-white text-center font-bold"
                      />
                      <span className="text-[10px] text-gray-500 block text-center mt-0.5">mins</span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block mb-1 text-gray-700">{t.taskLocation}</label>
                  <input
                    type="text"
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                    placeholder={t.taskLocationPlaceholder}
                    className="w-full px-3 py-2 doodle-border-sm bg-white focus:outline-none focus:bg-amber-50 font-normal h-[38px]"
                  />
                </div>
              </div>

              <div>
                <label className="block mb-1 text-gray-700">Quadrant</label>
                <select
                  value={editQuadrant}
                  onChange={(e) => setEditQuadrant(e.target.value as EisenhowerQuadrant)}
                  className="w-full px-2 py-2 doodle-border-sm bg-white"
                >
                  <option value="now">Do Now (Urgent & Important)</option>
                  <option value="plan">Schedule (Important)</option>
                  <option value="quick">Delegate / Quick</option>
                  <option value="chill">Don't Do / Chill</option>
                  <option value="deadline">⏰ {user.language === 'th' ? 'มีกำหนดส่ง (Deadline)' : 'Deadline'}</option>
                </select>
              </div>

              {goals.length > 0 && (
                <div>
                  <label className="block mb-1 text-gray-700">Link to Goal (Optional)</label>
                  <select
                    value={editGoalId}
                    onChange={(e) => setEditGoalId(e.target.value)}
                    className="w-full px-2 py-2 doodle-border-sm bg-white"
                  >
                    <option value="">None</option>
                    {goals.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="flex-1 py-2.5 bg-gray-100 doodle-border-sm font-bold doodle-btn"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-accent doodle-border-sm font-black doodle-btn"
                >
                  {t.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 📤 Share Task to Group Modal */}
      {sharingTask && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white doodle-border doodle-shadow-lg max-w-md w-full p-5 space-y-4">
            <div className="flex justify-between items-center border-b-2 border-black pb-2">
              <h3 className="font-extrabold text-lg font-['Bricolage_Grotesque'] flex items-center gap-2">
                <Share2 className="w-5 h-5" />
                {user.language === 'th' ? 'แชร์งานลงกลุ่ม' : 'Share task to group'}
              </h3>
              <button
                type="button"
                onClick={closeShareModal}
                className="p-1 hover:bg-gray-100 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs font-bold text-gray-600">
              "{sharingTask.title}"
            </p>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {myGroups.map((group) => {
                const isSelected = selectedShareGroupId === group.id;
                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => setSelectedShareGroupId(group.id)}
                    className={`w-full flex items-center gap-3 p-2.5 doodle-border-sm text-left transition-colors ${
                      isSelected ? 'bg-accent' : 'bg-white hover:bg-gray-50'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-lg bg-accent doodle-border-sm flex items-center justify-center font-black text-sm overflow-hidden shrink-0">
                      <ShareGroupAvatar name={group.name} imageUrl={group.imageUrl} />
                    </div>
                    <span className="text-xs font-extrabold flex-1 min-w-0 truncate">
                      {group.name}
                    </span>
                    {isSelected && <Check className="w-4 h-4 stroke-[3] shrink-0" />}
                  </button>
                );
              })}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={closeShareModal}
                className="flex-1 py-2.5 bg-gray-100 doodle-border-sm font-bold doodle-btn"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                disabled={!selectedShareGroupId || isSharingTask}
                onClick={handleConfirmShareTask}
                className="flex-1 py-2.5 bg-accent doodle-border-sm font-black doodle-btn disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                <Users className="w-4 h-4" />
                {isSharingTask
                  ? (user.language === 'th' ? 'กำลังแชร์...' : 'Sharing...')
                  : (user.language === 'th' ? 'แชร์งานนี้' : 'Share')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
