// src/components/groups/GroupsView.tsx
import React, { useState, useEffect, useRef } from 'react';
import { 
  Users, 
  Plus, 
  UserPlus, 
  Clock,
  ArrowLeft, 
  Search, 
  UserCheck, 
  AlertCircle,
  ChevronRight,
  ChevronLeft,
  ChevronUp,
  ChevronDown,
  LayoutGrid,
  Layers,
  MapPin,
  Trash2,
  Pencil,
  CalendarDays,
  Upload,
  Link as LinkIcon,
  Image as ImageIcon
} from 'lucide-react';
import { toLocalDateStr, getLocalTodayStr } from '../../utils/date';
import defaultGroupAvatarImg from '../../assets/group-default-avatar.jpg';
import type { UserProfile } from '../../types';
import { DEFAULT_AVATAR_URL } from '../../context/AppContext';

// Import Firebase Config & Firestore Methods
import { db, auth } from '../../lib/firebase';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  updateDoc, 
  arrayUnion, 
  addDoc, 
  deleteDoc,
  setDoc,
  onSnapshot 
} from 'firebase/firestore';

// ไม่บันทึกรูปโปรไฟล์ "ค่าเริ่มต้น" ลงในข้อมูลสมาชิกกลุ่ม เพราะเป็นไฟล์ asset ที่ผูกกับ
// เวอร์ชันของแอป (ชื่อไฟล์อาจเปลี่ยนตอน build ใหม่) ถ้าเก็บ URL นี้ไว้ใน Firestore
// พอ deploy เวอร์ชันใหม่ path เดิมอาจใช้ไม่ได้แล้วกลายเป็นรูปหาย ปล่อยว่างไว้ให้ UI
// ไปแสดงเป็นตัวอักษรย่อแทนจะเสถียรกว่า ส่วนถ้า user อัปโหลดรูปเองจริง ๆ (URL อื่น) ค่อยเก็บ
const resolveMemberAvatar = (url?: string) =>
  url && url.trim() !== '' && url !== DEFAULT_AVATAR_URL ? url : '';

// Interfaces
interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
}

interface GroupMember {
  id: string;
  name: string;
  email: string;
  role: 'Owner' | 'Member';
  avatarUrl?: string;
}

interface GroupTask {
  id: string;
  groupId: string;
  title: string;
  description?: string;
  category?: string;
  quadrant?: string;
  noTimeLimit?: boolean;
  startTime?: string;
  endTime?: string;
  durationHrs?: number;
  durationMins?: number;
  location?: string;
  sharedBy: string;
  creatorId: string;
  responses?: { [userId: string]: 'ACCEPTED' | 'REJECTED' };
  // วันที่ของงาน (YYYY-MM-DD) — ใช้แสดงผลในมุมมองปฏิทิน
  // งานเก่าที่สร้างก่อนอัปเดตนี้อาจไม่มีค่านี้ (undefined) จะถูกจัดเป็น "ยังไม่ระบุวันที่"
  dueDate?: string;
}

interface Group {
  id: string;
  name: string;
  description: string;
  membersCount: number;
  pendingTasksCount: number;
  members: GroupMember[];
  memberIds: string[];
  imageUrl?: string;
}

// Custom Inline SVG Icons
const IconClose = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const IconCheck = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
  </svg>
);

const IconShield = ({ className = "w-3 h-3" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

interface GroupsViewProps {
  user?: UserProfile;
}

// รูปโปรไฟล์สมาชิก — ถ้าโหลดรูปไม่ขึ้น (ลิงก์เสีย/ถูกลบ) ให้ตกกลับไปแสดงตัวอักษรย่อ
// แทนที่จะปล่อยให้เห็นไอคอน "รูปหาย" ของเบราว์เซอร์
const MemberAvatar: React.FC<{ name: string; email: string; avatarUrl?: string }> = ({
  name,
  email,
  avatarUrl,
}) => {
  const [failed, setFailed] = useState(false);
  const showImage = !!avatarUrl && avatarUrl.trim() !== '' && !failed;

  if (showImage) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        onError={() => setFailed(true)}
        className="w-9 h-9 rounded-lg object-cover doodle-border-sm bg-accent"
      />
    );
  }

  return (
    <div className="w-9 h-9 rounded-lg bg-accent doodle-border-sm font-black flex items-center justify-center text-sm font-['Bricolage_Grotesque']">
      {(name || email).charAt(0).toUpperCase()}
    </div>
  );
};

export const GroupsView: React.FC<GroupsViewProps> = ({ user }) => {
  // Main States
  const [groups, setGroups] = useState<Group[]>([]);
  const [tasks, setTasks] = useState<GroupTask[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);

  // Modal States
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [showEditTaskModal, setShowEditTaskModal] = useState(false);

  // Modal + Form States - เปลี่ยนภาพกลุ่ม (Group Image)
  const [showGroupImageModal, setShowGroupImageModal] = useState(false);
  const [tempGroupImageUrl, setTempGroupImageUrl] = useState('');
  const [pendingGroupImageUrl, setPendingGroupImageUrl] = useState('');
  const [isSavingGroupImage, setIsSavingGroupImage] = useState(false);
  const groupImageFileInputRef = useRef<HTMLInputElement>(null);

  // Form States - Group
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [newGroupImageUrl, setNewGroupImageUrl] = useState('');
  const [tempNewGroupImageUrl, setTempNewGroupImageUrl] = useState('');
  const newGroupImageFileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<'tasks' | 'members'>('tasks');

  // Filter งานในกลุ่มตามสถานะการตอบรับของฉัน: งานใหม่ / ยืนยันแล้ว / ปฏิเสธแล้ว
  const [taskStatusFilter, setTaskStatusFilter] = useState<'NEW' | 'ACCEPTED' | 'REJECTED'>('NEW');

  // Calendar States — เลือกวันที่เพื่อดู/เพิ่มงานของกลุ่มในวันนั้นๆ
  const [selectedDate, setSelectedDate] = useState<string>(getLocalTodayStr());
  const [viewMonthDate, setViewMonthDate] = useState<Date>(new Date());
  // สลับมุมมองปฏิทินกลุ่ม รายสัปดาห์ / รายเดือน และพับ/ขยายปฏิทิน (เหมือนหน้าปฏิทินหลัก)
  const [groupCalendarViewMode, setGroupCalendarViewMode] = useState<'week' | 'month'>('month');
  const [isGroupCalendarCollapsed, setIsGroupCalendarCollapsed] = useState(false);

  // Form States - Task
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [category, setCategory] = useState('Study');
  const [quadrant, setQuadrant] = useState('Do Now (Urgent & Imp');
  const [noTimeLimit, setNoTimeLimit] = useState(false);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('09:30');
  const [durationHrs, setDurationHrs] = useState<number>(0);
  const [durationMins, setDurationMins] = useState<number>(30);
  const [location, setLocation] = useState('');

  // ----------------------------------------------------
  // ⏱️ Start Time / End Time / Duration — เชื่อมกันเหมือนหน้าปฏิทินหลัก:
  // เปลี่ยนเวลาเริ่ม หรือ Duration → คำนวณเวลาสิ้นสุดใหม่
  // เปลี่ยนเวลาสิ้นสุด → คำนวณ Duration ใหม่
  // ----------------------------------------------------
  const timeToMinutes = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };

  const minutesToTime = (totalMinutes: number) => {
    const wrapped = ((totalMinutes % 1440) + 1440) % 1440;
    const h = Math.floor(wrapped / 60);
    const m = wrapped % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  const handleStartTimeChange = (value: string) => {
    setStartTime(value);
    const durationMinutes = Number(durationHrs) * 60 + Number(durationMins);
    setEndTime(minutesToTime(timeToMinutes(value) + durationMinutes));
  };

  const handleEndTimeChange = (value: string) => {
    setEndTime(value);
    let diff = timeToMinutes(value) - timeToMinutes(startTime);
    if (diff <= 0) diff += 1440; // ข้ามเที่ยงคืน ให้ถือว่า Duration เป็นบวกเสมอ
    setDurationHrs(Math.floor(diff / 60));
    setDurationMins(diff % 60);
  };

  const handleDurationHrsChange = (hours: number) => {
    setDurationHrs(hours);
    const totalMinutes = hours * 60 + Number(durationMins);
    setEndTime(minutesToTime(timeToMinutes(startTime) + totalMinutes));
  };

  const handleDurationMinsChange = (mins: number) => {
    setDurationMins(mins);
    const totalMinutes = Number(durationHrs) * 60 + mins;
    setEndTime(minutesToTime(timeToMinutes(startTime) + totalMinutes));
  };

  // Search User States
  const [searchEmail, setSearchEmail] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [foundUser, setFoundUser] = useState<User | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const currentUser = auth.currentUser;

  // Real-time Fetch Groups (เฉพาะกลุ่มที่เราเป็นสมาชิกอยู่เท่านั้น)
  useEffect(() => {
    if (!currentUser) {
      setGroups([]);
      return;
    }

    const q = query(
      collection(db, 'groups'),
      where('memberIds', 'array-contains', currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedGroups: Group[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<Group, 'id'>),
      }));
      setGroups(fetchedGroups);

      if (selectedGroup) {
        const updated = fetchedGroups.find((g) => g.id === selectedGroup.id);
        if (updated) {
          setSelectedGroup(updated);
        } else {
          setSelectedGroup(null); // ถ้ารถกลุ่มที่เลือกอยู่โดนลบ ให้เด้งกลับหน้าหลัก
        }
      }
    });

    return () => unsubscribe();
  }, [selectedGroup?.id, currentUser?.uid]);

  // Real-time Fetch Tasks
  useEffect(() => {
    if (!selectedGroup) return;

    const q = query(collection(db, 'groupTasks'), where('groupId', '==', selectedGroup.id));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedTasks: GroupTask[] = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Omit<GroupTask, 'id'>),
      }));
      setTasks(fetchedTasks);
    });

    return () => unsubscribe();
  }, [selectedGroup]);

  // Search User
  useEffect(() => {
    if (!searchEmail.trim()) {
      setFoundUser(null);
      setSearchError(null);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    setSearchError(null);

    const timer = setTimeout(async () => {
      try {
        const q = query(
          collection(db, 'users'),
          where('email', '==', searchEmail.trim().toLowerCase())
        );
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          const userDoc = querySnapshot.docs[0];
          const userData = {
            id: userDoc.id,
            name: userDoc.data().name || userDoc.data().displayName || 'Unknown',
            email: userDoc.data().email,
            avatarUrl: userDoc.data().avatarUrl,
          };

          const isAlreadyMember = selectedGroup?.members.some((m) => m.email === userData.email);
          if (isAlreadyMember) {
            setSearchError('ผู้ใช้นี้เป็นสมาชิกในกลุ่มนี้อยู่แล้ว');
            setFoundUser(null);
          } else {
            setFoundUser(userData);
            setSearchError(null);
          }
        } else {
          setFoundUser(null);
          setSearchError('ไม่พบผู้ใช้งานด้วย Email นี้ในระบบ');
        }
      } catch (error) {
        console.error('Error searching user:', error);
        setSearchError('เกิดข้อผิดพลาดในการค้นหาข้อมูล');
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [searchEmail, selectedGroup]);

  const resetTaskForm = () => {
    setEditingTaskId(null);
    setTaskTitle('');
    setTaskDescription('');
    setCategory('Study');
    setQuadrant('Do Now (Urgent & Imp');
    setNoTimeLimit(false);
    setStartTime('09:00');
    setEndTime('09:30');
    setDurationHrs(0);
    setDurationMins(30);
    setLocation('');
  };

  // เลือกภาพกลุ่มตอนสร้างกลุ่มใหม่ (อัปโหลดไฟล์ → แปลงเป็น base64)
  const handleNewGroupImageFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert('ไฟล์มีขนาดใหญ่เกินไป! กรุณาเลือกรูปภาพขนาดไม่เกิน 2MB');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setNewGroupImageUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    if (!currentUser) {
      alert('กรุณาเข้าสู่ระบบก่อนสร้างกลุ่ม');
      return;
    }

    try {
      const newGroupData = {
        name: newGroupName,
        description: newGroupDesc,
        imageUrl: newGroupImageUrl || defaultGroupAvatarImg,
        membersCount: 1,
        pendingTasksCount: 0,
        memberIds: [currentUser.uid],
        members: [
          { 
            id: currentUser.uid, 
            name: user?.name || currentUser?.displayName || currentUser?.email?.split('@')[0] || 'คุณ (Me)', 
            email: user?.email || currentUser?.email || 'you@example.com', 
            avatarUrl: resolveMemberAvatar(user?.avatarUrl),
            role: 'Owner' 
          }
        ]
      };

      await addDoc(collection(db, 'groups'), newGroupData);
      setNewGroupName('');
      setNewGroupDesc('');
      setNewGroupImageUrl('');
      setTempNewGroupImageUrl('');
      setShowCreateGroupModal(false);
    } catch (error) {
      console.error('Error creating group:', error);
      alert('เกิดข้อผิดพลาดในการสร้างกลุ่ม');
    }
  };

  // ฟังก์ชันลบกลุ่ม (เฉพาะ Owner)
  const handleDeleteGroup = async () => {
    if (!selectedGroup) return;

    const confirmDelete = window.confirm(
      `คุณต้องการลบกลุ่ม "${selectedGroup.name}" และงานทั้งหมดในกลุ่มนี้ใช่หรือไม่?\nการกระทำนี้ไม่สามารถย้อนกลับได้`
    );

    if (!confirmDelete) return;

    try {
      // 1. ลบ Task ทั้งหมดที่เกี่ยวข้องกับกลุ่มนี้
      const taskQuery = query(collection(db, 'groupTasks'), where('groupId', '==', selectedGroup.id));
      const taskSnapshot = await getDocs(taskQuery);
      
      const deletePromises = taskSnapshot.docs.map((taskDoc) => 
        deleteDoc(doc(db, 'groupTasks', taskDoc.id))
      );
      await Promise.all(deletePromises);

      // 2. ลบตัวกลุ่มออกจาก Firestore
      await deleteDoc(doc(db, 'groups', selectedGroup.id));

      setSelectedGroup(null);
      alert('ลบกลุ่มเรียบร้อยแล้ว');
    } catch (error) {
      console.error('Error deleting group:', error);
      alert('เกิดข้อผิดพลาดในการลบกลุ่ม');
    }
  };

  // 🖼️ เปลี่ยนภาพกลุ่ม (เฉพาะ Owner) — รองรับทั้งอัปโหลดไฟล์ (แปลงเป็น base64) และวาง URL
  // หมายเหตุ: ทั้งสองวิธีจะแค่ "พรีวิว" ภาพไว้ก่อน ต้องกดยืนยันถึงจะบันทึกจริง
  const handleGroupImageFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert('ไฟล์มีขนาดใหญ่เกินไป! กรุณาเลือกรูปภาพขนาดไม่เกิน 2MB');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      setPendingGroupImageUrl(base64String);
    };
    reader.readAsDataURL(file);
  };

  const handleApplyGroupImageUrl = () => {
    if (tempGroupImageUrl.trim()) {
      setPendingGroupImageUrl(tempGroupImageUrl.trim());
      setTempGroupImageUrl('');
    }
  };

  const handleConfirmGroupImage = () => {
    if (pendingGroupImageUrl.trim()) {
      saveGroupImage(pendingGroupImageUrl.trim());
    }
  };

  const saveGroupImage = async (imageUrl: string) => {
    if (!selectedGroup) return;
    setIsSavingGroupImage(true);
    try {
      await updateDoc(doc(db, 'groups', selectedGroup.id), { imageUrl });
      setShowGroupImageModal(false);
      setTempGroupImageUrl('');
      setPendingGroupImageUrl('');
    } catch (error) {
      console.error('Error updating group image:', error);
      alert('ไม่สามารถเปลี่ยนภาพกลุ่มได้ กรุณาลองใหม่');
    } finally {
      setIsSavingGroupImage(false);
    }
  };

  const handleRemoveGroupImage = async () => {
    if (!selectedGroup) return;
    setIsSavingGroupImage(true);
    try {
      await updateDoc(doc(db, 'groups', selectedGroup.id), { imageUrl: '' });
      setShowGroupImageModal(false);
      setTempGroupImageUrl('');
      setPendingGroupImageUrl('');
    } catch (error) {
      console.error('Error removing group image:', error);
      alert('ไม่สามารถลบภาพกลุ่มได้ กรุณาลองใหม่');
    } finally {
      setIsSavingGroupImage(false);
    }
  };

  const handleConfirmInvite = async () => {
    if (!foundUser || !selectedGroup) return;

    const newMember: GroupMember = {
      id: foundUser.id,
      name: foundUser.name,
      email: foundUser.email,
      avatarUrl: resolveMemberAvatar(foundUser.avatarUrl),
      role: 'Member'
    };

    try {
      const groupRef = doc(db, 'groups', selectedGroup.id);
      await updateDoc(groupRef, {
        membersCount: (selectedGroup.membersCount || 0) + 1,
        members: arrayUnion(newMember),
        memberIds: arrayUnion(foundUser.id)
      });

      setSearchEmail('');
      setFoundUser(null);
      setShowInviteModal(false);
    } catch (error) {
      console.error('Error adding member:', error);
      alert('เกิดข้อผิดพลาดในการเพิ่มสมาชิก');
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim() || !selectedGroup || !currentUser) return;

    try {
      await addDoc(collection(db, 'groupTasks'), {
        groupId: selectedGroup.id,
        title: taskTitle,
        description: taskDescription,
        category,
        quadrant,
        noTimeLimit,
        startTime: noTimeLimit ? '' : startTime,
        endTime: noTimeLimit ? '' : endTime,
        durationHrs,
        durationMins,
        location,
        dueDate: selectedDate,
        sharedBy: currentUser.displayName || currentUser.email?.split('@')[0] || 'สมาชิกในกลุ่ม',
        creatorId: currentUser.uid,
        responses: {}
      });

      resetTaskForm();
      setShowAddTaskModal(false);
    } catch (error) {
      console.error('Error adding task:', error);
      alert('เกิดข้อผิดพลาดในการสร้างงาน');
    }
  };

  const openEditTaskModal = (task: GroupTask) => {
    setEditingTaskId(task.id);
    setTaskTitle(task.title || '');
    setTaskDescription(task.description || '');
    setCategory(task.category || 'Study');
    setQuadrant(task.quadrant || 'Do Now (Urgent & Imp');
    setNoTimeLimit(task.noTimeLimit || false);
    setStartTime(task.startTime || '09:00');
    setEndTime(task.endTime || '09:30');
    setDurationHrs(task.durationHrs || 0);
    setDurationMins(task.durationMins || 0);
    setLocation(task.location || '');
    setShowEditTaskModal(true);
  };

  const handleEditTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTaskId || !taskTitle.trim()) return;

    try {
      const taskRef = doc(db, 'groupTasks', editingTaskId);
      await updateDoc(taskRef, {
        title: taskTitle,
        description: taskDescription,
        category,
        quadrant,
        noTimeLimit,
        startTime: noTimeLimit ? '' : startTime,
        endTime: noTimeLimit ? '' : endTime,
        durationHrs,
        durationMins,
        location,
      });

      resetTaskForm();
      setShowEditTaskModal(false);
    } catch (error) {
      console.error('Error updating task:', error);
      alert('เกิดข้อผิดพลาดในการแก้ไขงาน');
    }
  };

  // ----------------------------------------------------
  // 📅 Sync งานกลุ่มที่ "ยืนยันรับ" ไปลงปฏิทินส่วนตัวของผู้ใช้คนนั้นๆ
  // เก็บไว้ที่ users/{uid}/tasks/group_{groupTaskId} — ใช้ id คงที่ ผูกกับงานกลุ่มนั้นเสมอ
  // เพื่อกันไม่ให้ซ้ำซ้อนเวลากดยืนยันหลายครั้ง และลบออกได้ตรงตัวเวลาเปลี่ยนใจ/ลบงาน
  // ----------------------------------------------------
  const personalTaskIdForGroupTask = (groupTaskId: string) => `group_${groupTaskId}`;

  // แปลงหมวดหมู่ของงานกลุ่ม (Study/Work/Personal/Other) ให้ตรงกับหมวดหมู่ฝั่งปฏิทินส่วนตัว
  const mapGroupCategoryToPersonal = (category?: string) => {
    switch (category) {
      case 'Study': return 'STUDY';
      case 'Work': return 'WORK';
      case 'Personal': return 'PERSONAL';
      default: return 'PERSONAL';
    }
  };

  // แปลง Quadrant ของงานกลุ่ม ให้ตรงกับ eisenhowerQuadrant ฝั่งปฏิทินส่วนตัว
  const mapGroupQuadrantToPersonal = (quadrant?: string): 'now' | 'plan' | 'quick' | 'chill' => {
    switch (quadrant) {
      case 'Do Now (Urgent & Imp': return 'now';
      case 'Schedule (Not Urgent & Imp)': return 'plan';
      case 'Delegate (Urgent & Not Imp)': return 'quick';
      case 'Eliminate (Not Urgent & Not Imp)': return 'chill';
      default: return 'now';
    }
  };

  // เพิ่ม/อัปเดตงานกลุ่มนี้ในปฏิทินส่วนตัวของผู้ใช้ปัจจุบัน (เรียกตอนกด "ยืนยันรับงาน")
  const addGroupTaskToPersonalCalendar = async (task: GroupTask) => {
    if (!currentUser) return;
    try {
      const personalTaskId = personalTaskIdForGroupTask(task.id);
      await setDoc(doc(db, 'users', currentUser.uid, 'tasks', personalTaskId), {
        id: personalTaskId,
        title: task.title,
        description: task.description || '',
        location: task.location || '',
        category: mapGroupCategoryToPersonal(task.category),
        eisenhowerQuadrant: mapGroupQuadrantToPersonal(task.quadrant),
        dueDate: task.dueDate || getLocalTodayStr(),
        // ⚠️ ใช้ ?? ไม่ใช่ || เพราะ '' (ไม่ระบุเวลา) เป็นค่าที่ถูกต้อง ไม่ควรถูกแทนที่
        dueTime: task.noTimeLimit ? '' : (task.startTime ?? '09:00'),
        endTime: task.noTimeLimit ? undefined : task.endTime,
        durationMinutes: task.noTimeLimit
          ? 30
          : Math.max(1, (task.durationHrs || 0) * 60 + (task.durationMins || 0)),
        completed: false,
        // 🔗 อ้างอิงกลับไปยังงานกลุ่มต้นทาง เผื่อใช้ตรวจสอบ/ลิงก์กลับในอนาคต
        groupTaskId: task.id,
        groupId: task.groupId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    } catch (error) {
      console.error('Error syncing task to personal calendar:', error);
    }
  };

  // ลบงานนี้ออกจากปฏิทินส่วนตัวของผู้ใช้ปัจจุบัน (เรียกตอนเปลี่ยนใจ/ไม่ยืนยัน หรือเมื่องานกลุ่มถูกลบ)
  const removeGroupTaskFromPersonalCalendar = async (groupTaskId: string) => {
    if (!currentUser) return;
    try {
      await deleteDoc(doc(db, 'users', currentUser.uid, 'tasks', personalTaskIdForGroupTask(groupTaskId)));
    } catch (error) {
      // ไม่ต้องแจ้งเตือนผู้ใช้ ถ้าไม่เคยมีงานนี้ในปฏิทินส่วนตัวอยู่แล้ว การลบจะ error เฉยๆ ปล่อยผ่านได้
      console.error('Error removing task from personal calendar:', error);
    }
  };

  const handleTaskResponse = async (taskId: string, status: 'ACCEPTED' | 'REJECTED') => {
    if (!currentUser) {
      alert('กรุณาล็อกอินก่อนทำการตอบรับงาน');
      return;
    }

    try {
      const taskRef = doc(db, 'groupTasks', taskId);
      await updateDoc(taskRef, {
        [`responses.${currentUser.uid}`]: status
      });

      // ✅ ยืนยันรับงาน → เพิ่มลงปฏิทินส่วนตัวทันที
      // ❌ ไม่ยืนยัน/เปลี่ยนใจ → เอาออกจากปฏิทินส่วนตัว (ถ้าเคยเพิ่มไว้)
      if (status === 'ACCEPTED') {
        const task = tasks.find((t) => t.id === taskId);
        if (task) await addGroupTaskToPersonalCalendar(task);
      } else {
        await removeGroupTaskFromPersonalCalendar(taskId);
      }
    } catch (error) {
      console.error('Error updating task response:', error);
      alert('ไม่สามารถอัปเดตสถานะได้');
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!window.confirm('คุณต้องการลบงานนี้ใช่หรือไม่?')) return;

    try {
      await deleteDoc(doc(db, 'groupTasks', taskId));
      // ลบสำเนาในปฏิทินส่วนตัวของเราเองด้วย (ถ้าเคยยืนยันรับงานนี้ไว้)
      await removeGroupTaskFromPersonalCalendar(taskId);
    } catch (error) {
      console.error('Error deleting task:', error);
      alert('เกิดข้อผิดพลาดในการลบงาน');
    }
  };

  // ตรวจสอบว่าผู้ใช้ปัจจุบันเป็น Owner ของกลุ่มหรือไม่
  // ⚠️ ใช้ uid (m.id) เป็นหลัก เพราะผู้ใช้แบบ Guest (Anonymous) จะไม่มี email จริง
  // ถ้าเทียบด้วย email อย่างเดียว ผู้สร้างกลุ่มที่เป็น Guest จะไม่ถูกจัดว่าเป็น Owner ของกลุ่มตัวเอง
  const isGroupOwner = selectedGroup?.members.some(
    (m) => m.role === 'Owner' && (m.id === currentUser?.uid || (!!m.email && m.email === currentUser?.email))
  );

  // ----------------------------------------------------
  // 🗓️ Group Calendar — คำนวณ Month Grid เหมือนหน้าปฏิทินหลัก
  // ----------------------------------------------------
  const currentYear = viewMonthDate.getFullYear();
  const currentMonth = viewMonthDate.getMonth();
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
  const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);

  let startDayOfWeek = firstDayOfMonth.getDay() - 1;
  if (startDayOfWeek === -1) startDayOfWeek = 6;

  const totalDaysInMonth = lastDayOfMonth.getDate();
  const todayStr = getLocalTodayStr();

  const buildGridCell = (d: Date, isCurrentMonth: boolean) => {
    const dateStr = toLocalDateStr(d);
    const taskCount = tasks.filter((t) => t.dueDate === dateStr).length;
    return {
      dateStr,
      dayNum: d.getDate(),
      isCurrentMonth,
      isToday: dateStr === todayStr,
      taskCount,
    };
  };

  const monthGridDays: Array<ReturnType<typeof buildGridCell>> = [];

  const prevMonthLastDay = new Date(currentYear, currentMonth, 0).getDate();
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const dayNum = prevMonthLastDay - i;
    monthGridDays.push(buildGridCell(new Date(currentYear, currentMonth - 1, dayNum), false));
  }
  for (let day = 1; day <= totalDaysInMonth; day++) {
    monthGridDays.push(buildGridCell(new Date(currentYear, currentMonth, day), true));
  }
  const remainingCells = (7 - (monthGridDays.length % 7)) % 7;
  for (let day = 1; day <= remainingCells; day++) {
    monthGridDays.push(buildGridCell(new Date(currentYear, currentMonth + 1, day), false));
  }

  const monthYearLabel = viewMonthDate.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
  const dayHeaders = ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.'];

  // 🎯 มุมมองรายสัปดาห์ (Week Strip) — แสดง 5 วัน (วันที่เลือก ± 2 วัน) เหมือนหน้าปฏิทินหลัก
  const currentSelectedObj = new Date(selectedDate);
  const groupDaysOfWeek = [-2, -1, 0, 1, 2].map((offset) => {
    const d = new Date(currentSelectedObj);
    d.setDate(d.getDate() + offset);
    const dateStr = toLocalDateStr(d);
    const dayName = d.toLocaleDateString('th-TH', { weekday: 'short' }).toUpperCase();
    const dayNum = d.getDate();
    const taskCount = tasks.filter((t) => t.dueDate === dateStr).length;
    return {
      dateStr,
      dayName,
      dayNum,
      isToday: dateStr === todayStr,
      isSelected: dateStr === selectedDate,
      taskCount,
    };
  });

  const handlePrevMonth = () => setViewMonthDate(new Date(currentYear, currentMonth - 1, 1));
  const handleNextMonth = () => setViewMonthDate(new Date(currentYear, currentMonth + 1, 1));

  const handleSelectDay = (dateStr: string) => {
    setSelectedDate(dateStr);
    const selectedObj = new Date(dateStr);
    setViewMonthDate(new Date(selectedObj.getFullYear(), selectedObj.getMonth(), 1));
  };

  const selectedDateLabel = new Date(selectedDate).toLocaleDateString('th-TH', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  // งานของวันที่เลือกไว้ / งานเก่าที่ยังไม่เคยระบุวันที่ (backward-compat)
  const tasksForSelectedDate = tasks.filter((t) => t.dueDate === selectedDate);
  const undatedTasks = tasks.filter((t) => !t.dueDate);

  // แยกงานตามสถานะการตอบรับของ "ฉัน" — งานใหม่ (ยังไม่ตอบ) / ยืนยันแล้ว / ปฏิเสธแล้ว
  const getMyStatus = (task: GroupTask): 'ACCEPTED' | 'REJECTED' | undefined =>
    currentUser ? task.responses?.[currentUser.uid] : undefined;

  const groupTasksByStatus = (list: GroupTask[]) => ({
    newTasks: list.filter((t) => !getMyStatus(t)),
    acceptedTasks: list.filter((t) => getMyStatus(t) === 'ACCEPTED'),
    rejectedTasks: list.filter((t) => getMyStatus(t) === 'REJECTED'),
  });

  const selectedDateStatusGroups = groupTasksByStatus(tasksForSelectedDate);
  const undatedStatusGroups = groupTasksByStatus(undatedTasks);

  const filteredTasksForSelectedDate =
    taskStatusFilter === 'NEW'
      ? selectedDateStatusGroups.newTasks
      : taskStatusFilter === 'ACCEPTED'
      ? selectedDateStatusGroups.acceptedTasks
      : selectedDateStatusGroups.rejectedTasks;

  const filteredUndatedTasks =
    taskStatusFilter === 'NEW'
      ? undatedStatusGroups.newTasks
      : taskStatusFilter === 'ACCEPTED'
      ? undatedStatusGroups.acceptedTasks
      : undatedStatusGroups.rejectedTasks;

  // แถบแท็บแนวนอน (Pill Strip) สำหรับกรองงานตามสถานะ — งานใหม่ / ยืนยันแล้ว / ปฏิเสธแล้ว
  const taskStatusTabs: Array<{ key: 'NEW' | 'ACCEPTED' | 'REJECTED'; label: string; icon: string; count: number }> = [
    { key: 'NEW', label: 'งานใหม่', icon: '🆕', count: selectedDateStatusGroups.newTasks.length },
    { key: 'ACCEPTED', label: 'ยืนยันแล้ว', icon: '✅', count: selectedDateStatusGroups.acceptedTasks.length },
    { key: 'REJECTED', label: 'ปฏิเสธแล้ว', icon: '❌', count: selectedDateStatusGroups.rejectedTasks.length },
  ];

  const renderTaskStatusTabBar = () => (
    <div className="flex bg-white doodle-border-sm p-1 doodle-shadow-sm gap-1">
      {taskStatusTabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => setTaskStatusFilter(tab.key)}
          className={`flex-1 py-2 px-1 text-xs font-black rounded-lg transition-all doodle-btn ${
            taskStatusFilter === tab.key
              ? 'bg-[var(--ink-solid)] text-white shadow-[2px_2px_0px_var(--ink-black)]'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          {tab.icon} {tab.label} ({tab.count})
        </button>
      ))}
    </div>
  );

  // การ์ดงาน 1 ใบ — แยกเป็นฟังก์ชันกลาง ใช้ซ้ำได้ทั้งลิสต์งานตามวัน และลิสต์งานที่ยังไม่ระบุวันที่
  const renderTaskCard = (task: GroupTask) => {
    const myStatus = currentUser ? task.responses?.[currentUser.uid] : undefined;
    const isCreator = currentUser?.uid === task.creatorId;

    return (
      <div key={task.id} className="bg-white doodle-border doodle-shadow p-4 space-y-3">
        <div>
          <div className="flex items-center justify-between gap-2 mb-1">
            <h4 className="font-extrabold text-base text-[var(--text-main)] leading-snug">{task.title}</h4>
            {task.category && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-black bg-gray-100">
                {task.category}
              </span>
            )}
          </div>

          {task.description && (
            <p className="text-xs font-medium text-gray-600 mb-2 whitespace-pre-line">{task.description}</p>
          )}

          <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-gray-500">
            {task.noTimeLimit ? (
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> ไม่ระบุเวลา
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> {task.startTime} - {task.endTime} ({task.durationHrs}h {task.durationMins}m)
              </span>
            )}
            {task.location && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" /> {task.location}
              </span>
            )}
            <span>• โดย: {task.sharedBy}</span>
          </div>
        </div>

        <div className="pt-2 border-t border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-1">
            {isCreator && (
              <>
                <button
                  onClick={() => openEditTaskModal(task)}
                  title="แก้ไขงานนี้"
                  className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-transparent hover:border-blue-200"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDeleteTask(task.id)}
                  title="ลบงานนี้"
                  className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-200"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!myStatus && (
              <>
                <button
                  onClick={() => handleTaskResponse(task.id, 'ACCEPTED')}
                  className="flex items-center gap-1 bg-[#9DD9D2] hover:bg-teal-300 px-3 py-1.5 doodle-border-sm text-xs font-black doodle-btn"
                >
                  <IconCheck className="w-3.5 h-3.5" /> ยืนยันรับงาน
                </button>
                <button
                  onClick={() => handleTaskResponse(task.id, 'REJECTED')}
                  className="flex items-center gap-1 bg-[#FF4D4D] text-white hover:bg-red-600 px-3 py-1.5 doodle-border-sm text-xs font-black doodle-btn"
                >
                  <IconClose className="w-3.5 h-3.5" /> ไม่ยืนยัน
                </button>
              </>
            )}

            {myStatus === 'ACCEPTED' && (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 text-[11px] font-black bg-[#9DD9D2] text-black px-2.5 py-1 doodle-border-sm">
                  <IconCheck className="w-3.5 h-3.5" /> คุณยืนยันแล้ว
                </span>
                <button
                  onClick={() => handleTaskResponse(task.id, 'REJECTED')}
                  className="text-xs font-bold text-gray-500 hover:text-red-600 underline"
                >
                  เปลี่ยนใจ
                </button>
              </div>
            )}

            {myStatus === 'REJECTED' && (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 text-[11px] font-black bg-[#FF4D4D] text-white px-2.5 py-1 doodle-border-sm">
                  <IconClose className="w-3.5 h-3.5" /> คุณปฏิเสธงานนี้
                </span>
                <button
                  onClick={() => handleTaskResponse(task.id, 'ACCEPTED')}
                  className="text-xs font-bold text-gray-500 hover:text-emerald-700 underline"
                >
                  เปลี่ยนใจ
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="pb-24 pt-3 px-4 max-w-md mx-auto space-y-4 font-sans text-gray-800">
      
      {!selectedGroup ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h1 className="text-xl font-extrabold tracking-tight font-['Bricolage_Grotesque'] flex items-center gap-2">
                <Users className="w-6 h-6 text-black shrink-0" />
                กลุ่มของฉัน (Groups)
              </h1>
              <p className="text-[11px] font-bold text-gray-500 mt-0.5">
                จัดการกลุ่มและแชร์รายการงานร่วมกับทีมของคุณ
              </p>
            </div>
            <button
              onClick={() => setShowCreateGroupModal(true)}
              className="flex items-center gap-1 bg-accent px-3 py-2 doodle-border-sm doodle-shadow-sm text-xs font-black doodle-btn shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>สร้างกลุ่มใหม่</span>
            </button>
          </div>

          {groups.length === 0 ? (
            <div className="bg-white doodle-border doodle-shadow p-8 text-center space-y-3">
              
              <h3 className="font-extrabold text-base font-['Bricolage_Grotesque']">ยังไม่มีกลุ่มในระบบ</h3>
              <p className="text-xs font-medium text-gray-600 max-w-xs mx-auto">
                เริ่มต้นด้วยการสร้างกลุ่มใหม่เพื่อแชร์งาน และทำงานร่วมกับเพื่อนของคุณ
              </p>
              <button
                onClick={() => setShowCreateGroupModal(true)}
                className="mt-2 bg-[var(--ink-solid)] text-white px-4 py-2 rounded-xl text-xs font-bold doodle-btn inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5 text-[var(--accent-color)]" />
                สร้างกลุ่มแรกของคุณ
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {groups.map((group) => (
                <div
                  key={group.id}
                  onClick={() => setSelectedGroup(group)}
                  className="bg-white doodle-border doodle-shadow p-4 relative transition-all cursor-pointer hover:bg-amber-50/30 group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-accent doodle-border-sm flex items-center justify-center font-black font-['Bricolage_Grotesque'] text-lg shrink-0 overflow-hidden">
                        {group.imageUrl ? (
                          <img src={group.imageUrl} alt={group.name} className="w-full h-full object-cover" />
                        ) : (
                          group.name.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div>
                        <h3 className="font-extrabold text-base leading-snug font-['Bricolage_Grotesque'] group-hover:underline">
                          {group.name}
                        </h3>
                        <p className="text-xs text-gray-600 line-clamp-1 mt-0.5">
                          {group.description || 'ไม่มีคำอธิบายกลุ่ม'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t-2 border-black flex items-center justify-between text-xs font-extrabold">
                    <div className="flex items-center gap-1.5 text-gray-700">
                      <Users className="w-3.5 h-3.5" />
                      <span>{group.members?.length || 0} สมาชิก</span>
                    </div>
                    <div className="flex items-center gap-1 text-black bg-gray-100 px-2.5 py-1 rounded-md doodle-border-sm font-bold text-[11px]">
                      <span>รายละเอียด</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setSelectedGroup(null)}
              className="flex items-center gap-1 text-xs font-extrabold bg-white px-3 py-1.5 doodle-border-sm doodle-btn"
            >
              <ArrowLeft className="w-4 h-4" />
              ย้อนกลับไปหน้ากลุ่มทั้งหมด
            </button>

            {/* ปุ่มลบกลุ่ม (แสดงเฉพาะ Owner) */}
            {isGroupOwner && (
              <button
                onClick={handleDeleteGroup}
                className="flex items-center gap-1 bg-red-100 hover:bg-red-200 text-red-600 px-3 py-1.5 doodle-border-sm text-xs font-extrabold doodle-btn"
                title="ลบกลุ่มนี้"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>ลบกลุ่ม</span>
              </button>
            )}
          </div>

          <div className="bg-white doodle-border doodle-shadow p-4 space-y-3">
            <div className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="relative shrink-0">
                    <div className="w-14 h-14 rounded-xl bg-accent doodle-border-sm flex items-center justify-center font-black font-['Bricolage_Grotesque'] text-xl overflow-hidden">
                      {selectedGroup.imageUrl ? (
                        <img src={selectedGroup.imageUrl} alt={selectedGroup.name} className="w-full h-full object-cover" />
                      ) : (
                        selectedGroup.name.charAt(0).toUpperCase()
                      )}
                    </div>
                    {isGroupOwner && (
                      <button
                        type="button"
                        onClick={() => {
                          setTempGroupImageUrl('');
                          setPendingGroupImageUrl('');
                          setShowGroupImageModal(true);
                        }}
                        className="absolute -bottom-1.5 -right-1.5 bg-white p-1 rounded-lg border-2 border-black shadow-[2px_2px_0px_var(--ink-black)] hover:scale-110 active:scale-95 transition-transform"
                        title="เปลี่ยนภาพกลุ่ม"
                      >
                        <Pencil className="w-3 h-3 text-black stroke-[2.5]" />
                      </button>
                    )}
                  </div>
                  <div>
                    <h1 className="text-xl font-black font-['Bricolage_Grotesque'] leading-tight">{selectedGroup.name}</h1>
                    <p className="text-xs font-medium text-gray-600 mt-1">{selectedGroup.description || 'ไม่มีคำอธิบายกลุ่ม'}</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setSearchEmail('');
                    setFoundUser(null);
                    setSearchError(null);
                    setShowInviteModal(true);
                  }}
                  className="flex items-center gap-1 bg-accent px-3 py-1.5 doodle-border-sm text-xs font-black doodle-btn shrink-0"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  เชิญเพื่อน
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t-2 border-black">
              <button
                onClick={() => setActiveTab('tasks')}
                className={`py-2 text-xs font-black text-center doodle-border-sm transition-all ${
                  activeTab === 'tasks'
                    ? 'bg-accent doodle-shadow-sm'
                    : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
              >
                งานในกลุ่ม ({tasks.length})
              </button>
              <button
                onClick={() => setActiveTab('members')}
                className={`py-2 text-xs font-black text-center doodle-border-sm transition-all ${
                  activeTab === 'members'
                    ? 'bg-accent doodle-shadow-sm'
                    : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                }`}
              >
                สมาชิก ({selectedGroup.members?.length || 0})
              </button>
            </div>
          </div>

          {activeTab === 'tasks' && (
            <div className="space-y-3">
              {/* 🗓️ ปฏิทินกลุ่ม — เลือกวันแล้วกดเพิ่มงานในวันนั้นได้เลย (พับ/ขยาย และสลับรายสัปดาห์/รายเดือนได้) */}
              <div className="bg-white doodle-border doodle-shadow p-3.5 space-y-2.5">
                <div className="flex items-center justify-between pb-2 border-b-2 border-black">
                  <button
                    onClick={() => setIsGroupCalendarCollapsed((v) => !v)}
                    className="flex items-center gap-2 flex-1 text-left"
                    title={isGroupCalendarCollapsed ? 'ขยายปฏิทิน' : 'พับปฏิทิน'}
                  >
                    <CalendarDays className="w-4 h-4 text-black shrink-0" />
                    <span className="font-extrabold text-sm font-['Bricolage_Grotesque'] capitalize">
                      {groupCalendarViewMode === 'month' ? monthYearLabel : selectedDateLabel}
                    </span>
                  </button>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => setGroupCalendarViewMode((m) => (m === 'week' ? 'month' : 'week'))}
                      className={`p-1.5 doodle-border-sm doodle-btn transition-colors ${
                        groupCalendarViewMode === 'month' ? 'bg-accent' : 'bg-gray-100 hover:bg-gray-200'
                      }`}
                      title="สลับมุมมองรายสัปดาห์ / รายเดือน"
                    >
                      {groupCalendarViewMode === 'week' ? <LayoutGrid className="w-4 h-4" /> : <Layers className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => setIsGroupCalendarCollapsed((v) => !v)}
                      className="p-1.5 bg-gray-100 hover:bg-gray-200 doodle-border-sm doodle-btn"
                      title={isGroupCalendarCollapsed ? 'ขยายปฏิทิน' : 'พับปฏิทิน'}
                    >
                      {isGroupCalendarCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {!isGroupCalendarCollapsed && (
                  <>
                    {groupCalendarViewMode === 'month' ? (
                      <>
                        <div className="flex items-center justify-between">
                          <button
                            onClick={handlePrevMonth}
                            className="p-1.5 bg-gray-100 hover:bg-accent doodle-border-sm doodle-btn"
                            title="เดือนก่อนหน้า"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <span className="font-extrabold text-sm font-['Bricolage_Grotesque'] capitalize">
                            {monthYearLabel}
                          </span>
                          <button
                            onClick={handleNextMonth}
                            className="p-1.5 bg-gray-100 hover:bg-accent doodle-border-sm doodle-btn"
                            title="เดือนถัดไป"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-black text-gray-600 uppercase">
                          {dayHeaders.map((dh, i) => (
                            <div key={i} className="py-1">{dh}</div>
                          ))}
                        </div>

                        <div className="grid grid-cols-7 gap-1">
                          {monthGridDays.map((cell, idx) => {
                            const isSelected = cell.dateStr === selectedDate;
                            return (
                              <button
                                key={idx}
                                onClick={() => handleSelectDay(cell.dateStr)}
                                title="เลือกวันนี้เพื่อดู/เพิ่มงาน"
                                className={`min-h-[42px] p-1 rounded-lg doodle-border-sm flex flex-col items-center justify-between transition-all relative ${
                                  isSelected
                                    ? 'bg-accent doodle-shadow-sm font-black border-[2.5px] scale-105 z-10'
                                    : cell.isToday
                                    ? 'bg-[#E6D4F9] border-black font-extrabold'
                                    : cell.isCurrentMonth
                                    ? 'bg-white hover:bg-gray-100 font-bold text-black'
                                    : 'bg-gray-50 opacity-40 text-gray-400'
                                }`}
                              >
                                <span className="text-xs">{cell.dayNum}</span>
                                {cell.taskCount > 0 && (
                                  <span
                                    className="w-1.5 h-1.5 rounded-full bg-[#FF4D4D] mt-0.5"
                                    title={`${cell.taskCount} งาน`}
                                  />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </>
                    ) : (
                      <div className="grid grid-cols-5 gap-2">
                        {groupDaysOfWeek.map((day) => (
                          <button
                            key={day.dateStr}
                            onClick={() => handleSelectDay(day.dateStr)}
                            className={`flex flex-col items-center py-2.5 px-1 doodle-border-sm doodle-btn relative transition-all ${
                              day.isSelected
                                ? 'bg-accent doodle-shadow scale-105 z-10 border-[3px]'
                                : 'bg-white doodle-shadow-sm hover:bg-[var(--paper-bg)]'
                            }`}
                          >
                            <span className="text-[11px] font-extrabold uppercase tracking-tight text-gray-700">
                              {day.dayName}
                            </span>
                            <span className={`text-lg font-black my-0.5 font-['Bricolage_Grotesque'] ${
                              day.isSelected ? 'w-8 h-8 rounded-full border-2 border-black flex items-center justify-center bg-white text-black' : ''
                            }`}>
                              {day.dayNum}
                            </span>
                            {day.taskCount > 0 && (
                              <span className="w-1.5 h-1.5 rounded-full bg-[#FF4D4D] mt-1" title={`${day.taskCount} งาน`} />
                            )}
                          </button>
                        ))}
                      </div>
                    )}

                    <button
                      onClick={() => handleSelectDay(getLocalTodayStr())}
                      className="w-full py-1.5 bg-gray-100 hover:bg-gray-200 doodle-border-sm text-[11px] font-black doodle-btn"
                    >
                      กลับไปวันนี้
                    </button>
                  </>
                )}
              </div>

              {/* งานของวันที่เลือกไว้ */}
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-extrabold text-sm font-['Bricolage_Grotesque']">
                    งานวันที่ {selectedDateLabel}
                  </h3>
                  <span className="text-[11px] font-bold text-gray-500">
                    {tasksForSelectedDate.length} งาน
                  </span>
                </div>
                <button 
                  onClick={() => setShowAddTaskModal(true)}
                  className="bg-accent hover:bg-yellow-400 text-black px-3 py-1.5 doodle-border-sm text-xs font-black doodle-btn flex items-center gap-1 shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  เพิ่มงานในวันนี้
                </button>
              </div>

              {/* แถบแท็บกรองงานตามสถานะ: งานใหม่ / ยืนยันแล้ว / ปฏิเสธแล้ว */}
              {renderTaskStatusTabBar()}

              {tasksForSelectedDate.length === 0 ? (
                <div className="bg-white doodle-border doodle-shadow p-6 text-center space-y-2">
                  <span className="text-3xl">📝</span>
                  <p className="text-xs font-bold text-gray-600">ยังไม่มีงานในวันที่เลือกนี้</p>
                  <button
                    onClick={() => setShowAddTaskModal(true)}
                    className="mt-2 bg-[var(--ink-solid)] text-white px-3 py-1.5 rounded-xl text-xs font-bold doodle-btn inline-flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3 text-[var(--accent-color)]" /> เพิ่มงานในวันนี้
                  </button>
                </div>
              ) : filteredTasksForSelectedDate.length === 0 ? (
                <div className="bg-white doodle-border doodle-shadow p-6 text-center space-y-1">
                  <span className="text-3xl">
                    {taskStatusFilter === 'NEW' ? '🆕' : taskStatusFilter === 'ACCEPTED' ? '✅' : '❌'}
                  </span>
                  <p className="text-xs font-bold text-gray-600">
                    ไม่มีงาน{taskStatusFilter === 'NEW' ? 'ใหม่' : taskStatusFilter === 'ACCEPTED' ? 'ที่ยืนยันแล้ว' : 'ที่ปฏิเสธแล้ว'}ในวันนี้
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredTasksForSelectedDate.map(renderTaskCard)}
                </div>
              )}

              {/* งานเก่าที่ยังไม่เคยระบุวันที่ (ก่อนอัปเดตฟีเจอร์ปฏิทิน) — แสดงแยกไว้ไม่ให้หายไป */}
              {undatedTasks.length > 0 && filteredUndatedTasks.length > 0 && (
                <div className="space-y-3 pt-2">
                  <h3 className="font-extrabold text-sm font-['Bricolage_Grotesque'] text-gray-500">
                    งานที่ยังไม่ระบุวันที่ ({filteredUndatedTasks.length})
                  </h3>
                  {filteredUndatedTasks.map(renderTaskCard)}
                </div>
              )}
            </div>
          )}

          {activeTab === 'members' && (
            <div className="bg-white doodle-border doodle-shadow divide-y-2 divide-black">
              {selectedGroup.members?.map((member) => (
                <div key={member.id || member.email} className="p-3.5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <MemberAvatar name={member.name} email={member.email} avatarUrl={member.avatarUrl} />
                    <div>
                      <p className="text-xs font-extrabold text-black">{member.name}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-black px-2.5 py-0.5 doodle-border-sm flex items-center gap-1 ${
                    member.role === 'Owner' 
                      ? 'bg-amber-200 text-black' 
                      : 'bg-gray-100 text-gray-700'
                  }`}>
                    {member.role === 'Owner' && <IconShield className="w-3 h-3" />}
                    {member.role}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal 1: สร้างกลุ่มใหม่ */}
      {showCreateGroupModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white doodle-border doodle-shadow-lg max-w-md w-full p-5 space-y-4">
            <div className="flex justify-between items-center border-b-2 border-black pb-2">
              <h3 className="font-extrabold text-lg font-['Bricolage_Grotesque']">
                สร้างกลุ่มใหม่
              </h3>
              <button 
                onClick={() => {
                  setNewGroupImageUrl('');
                  setTempNewGroupImageUrl('');
                  setShowCreateGroupModal(false);
                }}
                className="p-1 hover:bg-gray-100 rounded-full"
              >
                <IconClose className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateGroup} className="space-y-3 text-xs font-bold">
              {/* เลือกภาพกลุ่ม (ไม่บังคับ) */}
              <div className="space-y-3 pb-3 border-b-2 border-black/10">
                <input
                  type="file"
                  ref={newGroupImageFileInputRef}
                  onChange={handleNewGroupImageFileUpload}
                  accept="image/*"
                  className="hidden"
                />

                <div className="flex flex-col items-center gap-2">
                  <div className="w-20 h-20 rounded-full bg-accent doodle-border-sm flex items-center justify-center overflow-hidden shrink-0">
                    <img
                      src={newGroupImageUrl || defaultGroupAvatarImg}
                      alt="ภาพกลุ่ม"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  {newGroupImageUrl && (
                    <button
                      type="button"
                      onClick={() => setNewGroupImageUrl('')}
                      className="text-[11px] font-bold text-red-500 hover:underline"
                    >
                      ลบภาพที่เลือก (ใช้ภาพเริ่มต้น)
                    </button>
                  )}
                </div>

                {/* ตัวเลือกที่ 1: เลือกภาพจากเครื่อง */}
                <button
                  type="button"
                  onClick={() => newGroupImageFileInputRef.current?.click()}
                  className="w-full py-3 px-4 bg-accent doodle-border doodle-shadow font-extrabold text-xs doodle-btn flex items-center justify-center gap-2"
                >
                  <Upload className="w-4 h-4 stroke-[2.5]" /> เลือกภาพจากเครื่อง
                </button>

                <div className="flex items-center gap-2">
                  <div className="h-[2px] bg-black/10 flex-1" />
                  <span className="text-[10px] font-black uppercase text-gray-400">หรือ</span>
                  <div className="h-[2px] bg-black/10 flex-1" />
                </div>

                {/* ตัวเลือกที่ 2: วาง URL รูปภาพ */}
                <div className="space-y-1">
                  <label className="text-[11px] font-black uppercase tracking-wider text-gray-600 block">
                    วาง URL รูปภาพ
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      placeholder="https://example.com/image.jpg"
                      value={tempNewGroupImageUrl}
                      onChange={(e) => setTempNewGroupImageUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (tempNewGroupImageUrl.trim()) {
                            setNewGroupImageUrl(tempNewGroupImageUrl.trim());
                            setTempNewGroupImageUrl('');
                          }
                        }
                      }}
                      className="flex-1 p-2 doodle-input text-xs font-semibold bg-white"
                    />
                    <button
                      type="button"
                      disabled={!tempNewGroupImageUrl.trim()}
                      onClick={() => {
                        setNewGroupImageUrl(tempNewGroupImageUrl.trim());
                        setTempNewGroupImageUrl('');
                      }}
                      className="px-3 bg-black text-white rounded-lg font-bold text-xs hover:bg-gray-800 transition-colors flex items-center gap-1 disabled:opacity-50"
                    >
                      <LinkIcon className="w-3.5 h-3.5" /> ตกลง
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="block mb-1 text-gray-700">ชื่อกลุ่ม *</label>
                <input
                  type="text"
                  required
                  placeholder="เช่น แก๊งโปรเจกต์ Todo App"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="w-full px-3 py-2 doodle-border-sm focus:outline-none focus:bg-amber-50"
                />
              </div>

              <div>
                <label className="block mb-1 text-gray-700">คำอธิบายกลุ่ม</label>
                <textarea
                  placeholder="ระบุวัตถุประสงค์หรือรายละเอียดสั้นๆ..."
                  value={newGroupDesc}
                  onChange={(e) => setNewGroupDesc(e.target.value)}
                  className="w-full px-3 py-2 doodle-border-sm focus:outline-none focus:bg-amber-50 h-20 resize-none font-normal"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setNewGroupImageUrl('');
                    setTempNewGroupImageUrl('');
                    setShowCreateGroupModal(false);
                  }}
                  className="flex-1 py-2.5 bg-gray-100 doodle-border-sm font-bold doodle-btn"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-accent doodle-border-sm font-black doodle-btn"
                >
                  ยืนยันสร้างกลุ่ม
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: เพิ่มงานใหม่ */}
      {showAddTaskModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border-2 border-black p-5 max-w-sm w-full space-y-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] max-h-[90vh] overflow-y-auto">
            
            <div className="flex justify-between items-center border-b-2 border-black pb-2">
              <h3 className="font-bold text-base text-gray-900">
                เพิ่มงานใหม่
              </h3>
              <button 
                onClick={() => {
                  resetTaskForm();
                  setShowAddTaskModal(false);
                }}
                className="p-1 text-gray-500 hover:text-black"
              >
                <IconClose className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-3 text-xs font-bold text-gray-700">
              
              <div>
                <label className="block mb-1 font-bold text-gray-800">Task Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Read Chapter 4"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-black rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block mb-1 font-bold text-gray-800">รายละเอียด (ไม่บังคับ)</label>
                <input
                  type="text"
                  placeholder="เพิ่มรายละเอียดเกี่ยวกับงานนี้..."
                  value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-black rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none font-normal"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block mb-1 font-bold text-gray-800">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 border-2 border-black rounded-xl bg-white text-gray-800 focus:outline-none"
                  >
                    <option value="Study">Study</option>
                    <option value="Work">Work</option>
                    <option value="Personal">Personal</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block mb-1 font-bold text-gray-800">Quadrant</label>
                  <select
                    value={quadrant}
                    onChange={(e) => setQuadrant(e.target.value)}
                    className="w-full px-3 py-2 border-2 border-black rounded-xl bg-white text-gray-800 focus:outline-none truncate"
                  >
                    <option value="Do Now (Urgent & Imp">Do Now (Urgent & Imp</option>
                    <option value="Schedule (Not Urgent & Imp)">Schedule (Not Urgent)</option>
                    <option value="Delegate (Urgent & Not Imp)">Delegate (Urgent)</option>
                    <option value="Eliminate (Not Urgent & Not Imp)">Eliminate</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between border-2 border-black rounded-xl px-3 py-2.5 bg-gray-50">
                <span className="font-bold text-gray-800">ไม่ระบุเวลา</span>
                <button
                  type="button"
                  onClick={() => setNoTimeLimit(!noTimeLimit)}
                  className={`w-11 h-6 rounded-full border-2 border-black transition-colors relative flex items-center ${
                    noTimeLimit ? 'bg-sky-300' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded-full bg-white border-2 border-black transition-transform transform ${
                      noTimeLimit ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>

              {!noTimeLimit && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block mb-1 font-bold text-gray-800">Start Time</label>
                      <div className="relative">
                        <input
                          type="time"
                          value={startTime}
                          onChange={(e) => handleStartTimeChange(e.target.value)}
                          className="w-full px-3 py-2 border-2 border-black rounded-xl text-center font-extrabold text-sm text-gray-800 focus:outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block mb-1 font-bold text-gray-800">End Time</label>
                      <div className="relative">
                        <input
                          type="time"
                          value={endTime}
                          onChange={(e) => handleEndTimeChange(e.target.value)}
                          className="w-full px-3 py-2 border-2 border-black rounded-xl text-center font-extrabold text-sm text-gray-800 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block mb-1 font-bold text-gray-800">Duration (Hrs)</label>
                      <input
                        type="number"
                        min="0"
                        value={durationHrs}
                        onChange={(e) => handleDurationHrsChange(Math.max(0, Number(e.target.value)))}
                        className="w-full px-3 py-2 border-2 border-black rounded-xl text-center text-gray-800 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block mb-1 font-bold text-gray-800">Duration (Mins)</label>
                      <input
                        type="number"
                        min="0"
                        max="59"
                        value={durationMins}
                        onChange={(e) => handleDurationMinsChange(Math.max(0, Number(e.target.value)))}
                        className="w-full px-3 py-2 border-2 border-black rounded-xl text-center text-gray-800 focus:outline-none"
                      />
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="block mb-1 font-bold text-gray-800">สถานที่ (ไม่บังคับ)</label>
                <input
                  type="text"
                  placeholder="e.g. Library Room 301"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-black rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none font-normal"
                />
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    resetTaskForm();
                    setShowAddTaskModal(false);
                  }}
                  className="flex-1 py-2.5 bg-gray-100 border-2 border-black rounded-xl font-bold hover:bg-gray-200 transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-accent border-2 border-black rounded-xl font-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-y-0.5 transition-all"
                >
                  บันทึกงาน
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: แก้ไขงาน */}
      {showEditTaskModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border-2 border-black p-5 max-w-sm w-full space-y-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] max-h-[90vh] overflow-y-auto">
            
            <div className="flex justify-between items-center border-b-2 border-black pb-2">
              <h3 className="font-bold text-base text-gray-900">
                แก้ไขงาน
              </h3>
              <button 
                onClick={() => {
                  resetTaskForm();
                  setShowEditTaskModal(false);
                }}
                className="p-1 text-gray-500 hover:text-black"
              >
                <IconClose className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditTask} className="space-y-3 text-xs font-bold text-gray-700">
              
              <div>
                <label className="block mb-1 font-bold text-gray-800">Task Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Read Chapter 4"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-black rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block mb-1 font-bold text-gray-800">รายละเอียด (ไม่บังคับ)</label>
                <input
                  type="text"
                  placeholder="เพิ่มรายละเอียดเกี่ยวกับงานนี้..."
                  value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-black rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none font-normal"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block mb-1 font-bold text-gray-800">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 border-2 border-black rounded-xl bg-white text-gray-800 focus:outline-none"
                  >
                    <option value="Study">Study</option>
                    <option value="Work">Work</option>
                    <option value="Personal">Personal</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block mb-1 font-bold text-gray-800">Quadrant</label>
                  <select
                    value={quadrant}
                    onChange={(e) => setQuadrant(e.target.value)}
                    className="w-full px-3 py-2 border-2 border-black rounded-xl bg-white text-gray-800 focus:outline-none truncate"
                  >
                    <option value="Do Now (Urgent & Imp">Do Now (Urgent & Imp</option>
                    <option value="Schedule (Not Urgent & Imp)">Schedule (Not Urgent)</option>
                    <option value="Delegate (Urgent & Not Imp)">Delegate (Urgent)</option>
                    <option value="Eliminate (Not Urgent & Not Imp)">Eliminate</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between border-2 border-black rounded-xl px-3 py-2.5 bg-gray-50">
                <span className="font-bold text-gray-800">ไม่ระบุเวลา</span>
                <button
                  type="button"
                  onClick={() => setNoTimeLimit(!noTimeLimit)}
                  className={`w-11 h-6 rounded-full border-2 border-black transition-colors relative flex items-center ${
                    noTimeLimit ? 'bg-sky-300' : 'bg-gray-200'
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded-full bg-white border-2 border-black transition-transform transform ${
                      noTimeLimit ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>

              {!noTimeLimit && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block mb-1 font-bold text-gray-800">Start Time</label>
                      <div className="relative">
                        <input
                          type="time"
                          value={startTime}
                          onChange={(e) => handleStartTimeChange(e.target.value)}
                          className="w-full px-3 py-2 border-2 border-black rounded-xl text-center font-extrabold text-sm text-gray-800 focus:outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block mb-1 font-bold text-gray-800">End Time</label>
                      <div className="relative">
                        <input
                          type="time"
                          value={endTime}
                          onChange={(e) => handleEndTimeChange(e.target.value)}
                          className="w-full px-3 py-2 border-2 border-black rounded-xl text-center font-extrabold text-sm text-gray-800 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block mb-1 font-bold text-gray-800">Duration (Hrs)</label>
                      <input
                        type="number"
                        min="0"
                        value={durationHrs}
                        onChange={(e) => handleDurationHrsChange(Math.max(0, Number(e.target.value)))}
                        className="w-full px-3 py-2 border-2 border-black rounded-xl text-center text-gray-800 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block mb-1 font-bold text-gray-800">Duration (Mins)</label>
                      <input
                        type="number"
                        min="0"
                        max="59"
                        value={durationMins}
                        onChange={(e) => handleDurationMinsChange(Math.max(0, Number(e.target.value)))}
                        className="w-full px-3 py-2 border-2 border-black rounded-xl text-center text-gray-800 focus:outline-none"
                      />
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="block mb-1 font-bold text-gray-800">สถานที่ (ไม่บังคับ)</label>
                <input
                  type="text"
                  placeholder="e.g. Library Room 301"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full px-3 py-2 border-2 border-black rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none font-normal"
                />
              </div>

              <div className="flex gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    resetTaskForm();
                    setShowEditTaskModal(false);
                  }}
                  className="flex-1 py-2.5 bg-gray-100 border-2 border-black rounded-xl font-bold hover:bg-gray-200 transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-blue-500 text-white border-2 border-black rounded-xl font-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:translate-y-0.5 transition-all"
                >
                  บันทึกการแก้ไข
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 4: เชิญเพื่อนเข้ากลุ่ม */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white doodle-border doodle-shadow-lg max-w-sm w-full p-5 space-y-4">
            <div className="flex justify-between items-center border-b-2 border-black pb-2">
              <h3 className="font-extrabold text-base font-['Bricolage_Grotesque']">
                เชิญเพื่อนเข้ากลุ่ม
              </h3>
              <button 
                onClick={() => setShowInviteModal(false)}
                className="p-1 hover:bg-gray-100 rounded-full"
              >
                <IconClose className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block mb-1 font-extrabold text-gray-700">ค้นหาด้วย Email</label>
                <div className="relative">
                  <input
                    type="email"
                    placeholder="กรอก email สมาชิก..."
                    value={searchEmail}
                    onChange={(e) => setSearchEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 doodle-border-sm focus:outline-none focus:bg-amber-50 font-bold"
                  />
                  <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-2.5" />
                </div>
              </div>

              {isSearching && (
                <div className="py-4 text-center text-xs font-bold text-gray-500 animate-pulse">
                  กำลังค้นหา...
                </div>
              )}

              {searchError && (
                <div className="p-2.5 bg-red-50 border-2 border-red-500 rounded-xl text-red-600 flex items-center gap-2 font-bold text-[11px]">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{searchError}</span>
                </div>
              )}

              {foundUser && (
                <div className="p-3 bg-emerald-50 border-2 border-black rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-emerald-300 border border-black rounded-lg font-black flex items-center justify-center">
                      {foundUser.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-extrabold text-black text-xs">{foundUser.name}</p>
                      <p className="text-[10px] text-gray-600 font-semibold">{foundUser.email}</p>
                    </div>
                  </div>
                  <UserCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="flex-1 py-2 bg-gray-100 doodle-border-sm font-bold doodle-btn"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  disabled={!foundUser}
                  onClick={handleConfirmInvite}
                  className={`flex-1 py-2 doodle-border-sm font-black doodle-btn ${
                    foundUser ? 'bg-accent hover:bg-amber-400' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  เพิ่มสมาชิก
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal 5: เปลี่ยนภาพกลุ่ม */}
      {showGroupImageModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white doodle-border doodle-shadow w-full max-w-xs p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b-2 border-black/10 pb-2">
              <h3 className="font-black text-base flex items-center gap-2">
                <ImageIcon className="w-5 h-5" /> เปลี่ยนภาพกลุ่ม
              </h3>
              <button
                onClick={() => {
                  setPendingGroupImageUrl('');
                  setTempGroupImageUrl('');
                  setShowGroupImageModal(false);
                }}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <IconClose className="w-5 h-5" />
              </button>
            </div>

            {/* Hidden Input สำหรับเลือกไฟล์จากเครื่อง */}
            <input
              type="file"
              ref={groupImageFileInputRef}
              onChange={handleGroupImageFileUpload}
              accept="image/*"
              className="hidden"
            />

            {/* ตัวอย่างภาพกลุ่ม: แสดงภาพที่เพิ่งเลือก (ยังไม่บันทึก) ถ้ามี ไม่งั้นแสดงภาพปัจจุบันของกลุ่ม */}
            <div className="flex flex-col items-center gap-1">
              <div className="w-20 h-20 rounded-xl bg-accent doodle-border-sm flex items-center justify-center font-black font-['Bricolage_Grotesque'] text-2xl overflow-hidden shrink-0">
                {pendingGroupImageUrl || selectedGroup?.imageUrl ? (
                  <img
                    src={pendingGroupImageUrl || selectedGroup?.imageUrl}
                    alt={selectedGroup?.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  selectedGroup?.name.charAt(0).toUpperCase()
                )}
              </div>
              {pendingGroupImageUrl && (
                <span className="text-[10px] font-bold text-gray-500">
                  ภาพใหม่ (ยังไม่บันทึก)
                </span>
              )}
            </div>

            {/* ตัวเลือกที่ 1: อัปโหลดจากเครื่อง */}
            <button
              type="button"
              disabled={isSavingGroupImage}
              onClick={() => groupImageFileInputRef.current?.click()}
              className="w-full py-3 px-4 bg-accent doodle-border doodle-shadow font-extrabold text-xs doodle-btn flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Upload className="w-4 h-4 stroke-[2.5]" /> เลือกรูปภาพจากเครื่อง
            </button>

            <div className="flex items-center gap-2 my-2">
              <div className="h-[2px] bg-black/10 flex-1" />
              <span className="text-[10px] font-black uppercase text-gray-400">หรือ</span>
              <div className="h-[2px] bg-black/10 flex-1" />
            </div>

            {/* ตัวเลือกที่ 2: วาง URL รูปภาพ */}
            <div className="space-y-2">
              <label className="text-[11px] font-black uppercase tracking-wider text-gray-600 block">
                วาง URL รูปภาพ
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  placeholder="https://example.com/image.jpg"
                  value={tempGroupImageUrl}
                  onChange={(e) => setTempGroupImageUrl(e.target.value)}
                  className="flex-1 p-2 doodle-input text-xs font-semibold bg-white"
                />
                <button
                  type="button"
                  disabled={isSavingGroupImage || !tempGroupImageUrl.trim()}
                  onClick={handleApplyGroupImageUrl}
                  className="px-3 bg-black text-white rounded-lg font-bold text-xs hover:bg-gray-800 transition-colors flex items-center gap-1 disabled:opacity-50"
                >
                  <LinkIcon className="w-3.5 h-3.5" /> ตกลง
                </button>
              </div>
            </div>

            {/* ปุ่มยืนยันการเปลี่ยนภาพ (แสดงเมื่อมีภาพใหม่ที่ยังไม่บันทึก) */}
            {pendingGroupImageUrl && (
              <button
                type="button"
                disabled={isSavingGroupImage}
                onClick={handleConfirmGroupImage}
                className="w-full py-2.5 bg-accent doodle-border-sm font-black doodle-btn disabled:opacity-50"
              >
                {isSavingGroupImage ? 'กำลังบันทึก...' : 'ยืนยันเปลี่ยนภาพกลุ่ม'}
              </button>
            )}

            {/* ลบภาพกลุ่ม (กลับไปใช้ตัวอักษรย่อ) */}
            {selectedGroup?.imageUrl && (
              <button
                type="button"
                disabled={isSavingGroupImage}
                onClick={handleRemoveGroupImage}
                className="w-full py-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
              >
                ลบภาพกลุ่ม (ใช้ตัวอักษรย่อแทน)
              </button>
            )}
          </div>
        </div>
      )}

    </div>
  );
};