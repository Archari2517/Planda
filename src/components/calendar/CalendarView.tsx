import React, { useState, useRef, useEffect } from 'react';
import { Task, UserProfile, Goal, Routine, EisenhowerQuadrant } from '../../types';
import { useTranslation } from '../../utils/translations';
import { aiRescheduleMissedTasks, RescheduleProposal } from '../../services/geminiService';

import { 
  Calendar as CalendarIcon, 
  ChevronDown, 
  ChevronUp, 
  ChevronLeft,
  ChevronRight,
  Sparkles, 
  Plus, 
  Check, 
  Clock, 
  X,
  Trash2,
  Layers,
  LayoutGrid,
  List,
  Repeat,
  MapPin,
  Timer
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { toLocalDateStr, daysUntil, getDeadlineUrgency, formatDeadlineCountdown } from '../../utils/date';

interface CalendarViewProps {
  user: UserProfile;
  tasks: Task[];
  goals: Goal[];
  routines?: Routine[];
  onToggleTask: (taskId: string) => void;
  onAddTask: (task: Partial<Task>) => void;
  onUpdateTask: (task: Task) => void;
  onDeleteTask: (taskId: string) => void;
  onRescheduleBatch: (proposals: RescheduleProposal[]) => void;
  onEnsureMonthEvents?: (monthDate: Date) => void;
}

export const CalendarView: React.FC<CalendarViewProps> = ({
  user,
  tasks,
  goals,
  routines = [],
  onToggleTask,
  onAddTask,
  onUpdateTask,
  onDeleteTask,
  onRescheduleBatch,
  onEnsureMonthEvents
}) => {
  const t = useTranslation(user.language);

  // ----------------------------------------------------
  // Top-level View & Selection States
  // ----------------------------------------------------
  const [selectedDate, setSelectedDate] = useState<string>(toLocalDateStr(new Date()));
  const [calendarViewMode, setCalendarViewMode] = useState<'week' | 'month'>('week');
  const [viewMonthDate, setViewMonthDate] = useState<Date>(new Date());
  
  // State สำหรับสลับมุมมอง รายการ / ไทม์ไลน์เวลา
  const [viewMode, setViewMode] = useState<'list' | 'timeline'>('list');
  const timeSlots = Array.from({ length: 15 }, (_, i) => i + 7); // 07:00 - 21:00

  // UI & Action States
  const [isMissedCollapsed, setIsMissedCollapsed] = useState(false);
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [proposals, setProposals] = useState<RescheduleProposal[] | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  
  const monthInputRef = useRef<HTMLInputElement>(null);

  // ----------------------------------------------------
  // 🔁 Routine Generation Engine trigger
  // ----------------------------------------------------
  // เมื่อเปลี่ยนเดือน (viewMonthDate เปลี่ยน) หรือลิสต์ Routine เปลี่ยน
  // (เช่นเพิ่ม Routine ใหม่ที่มีผลกับเดือนที่กำลังดูอยู่) ให้สั่งคำนวณ/เติม Event
  // ของ Routine ทั้งหมดลงในเดือนที่กำลังแสดงผลอยู่โดยอัตโนมัติ
  useEffect(() => {
    onEnsureMonthEvents?.(viewMonthDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMonthDate, routines]);

  // New Task Form State
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newCategory, setNewCategory] = useState('STUDY');
  const [newTime, setNewTime] = useState('09:00');
  const [newEndTime, setNewEndTime] = useState('09:30');
  const [durationHours, setDurationHours] = useState(0);
  const [durationMins, setDurationMins] = useState(30);
  const [newQuadrant, setNewQuadrant] = useState<EisenhowerQuadrant>('now');
  const [newGoalId, setNewGoalId] = useState<string>('');
  // 🕒 ไม่ระบุเวลา (Anytime / Flex Task) — true = ไม่บังคับใส่ Start/End Time ตอนสร้างงาน
  // (เหมือน Flex Habit ของ Routine ที่ dueTime ว่าง '' และ endTime เป็น undefined)
  const [newIsFlexTime, setNewIsFlexTime] = useState(false);

  // ----------------------------------------------------
  // ⏱️ Start Time / End Time / Duration — สามค่านี้ผูกกันไว้:
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
    setNewTime(value);
    const durationMinutes = Number(durationHours) * 60 + Number(durationMins);
    setNewEndTime(minutesToTime(timeToMinutes(value) + durationMinutes));
  };

  const handleEndTimeChange = (value: string) => {
    setNewEndTime(value);
    let diff = timeToMinutes(value) - timeToMinutes(newTime);
    if (diff <= 0) diff += 1440; // ข้ามเที่ยงคืน ให้ถือว่า Duration เป็นบวกเสมอ
    setDurationHours(Math.floor(diff / 60));
    setDurationMins(diff % 60);
  };

  const handleDurationHoursChange = (hours: number) => {
    setDurationHours(hours);
    const totalMinutes = hours * 60 + Number(durationMins);
    setNewEndTime(minutesToTime(timeToMinutes(newTime) + totalMinutes));
  };

  const handleDurationMinsChange = (mins: number) => {
    setDurationMins(mins);
    const totalMinutes = Number(durationHours) * 60 + mins;
    setNewEndTime(minutesToTime(timeToMinutes(newTime) + totalMinutes));
  };

  // เวลาสิ้นสุดของงาน: ใช้ task.endTime ถ้ามี ไม่งั้นคำนวณจาก dueTime + durationMinutes
  const getTaskEndTime = (task: Task) => {
    if (task.endTime) return task.endTime;
    if (!task.dueTime) return '';
    return minutesToTime(timeToMinutes(task.dueTime) + (task.durationMinutes || 0));
  };

  // ----------------------------------------------------
  // Native Month Picker Handlers
  // ----------------------------------------------------
  const openMonthPicker = () => {
    if (monthInputRef.current) {
      if ('showPicker' in HTMLInputElement.prototype) {
        monthInputRef.current.showPicker();
      } else {
        monthInputRef.current.click();
      }
    }
  };

  const handleMonthInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.value) return;
    const [year, month] = e.target.value.split('-').map(Number);
    const newDate = new Date(year, month - 1, 1);
    setViewMonthDate(newDate);
    setSelectedDate(toLocalDateStr(newDate));
  };

  const formattedMonthValue = `${viewMonthDate.getFullYear()}-${String(viewMonthDate.getMonth() + 1).padStart(2, '0')}`;

  // ----------------------------------------------------
  // Drag & Drop Handlers
  // ----------------------------------------------------
  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('text/plain', taskId);
    setDraggedTaskId(taskId);
  };

  const handleDragOver = (e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    setDragOverDate(dateStr);
  };

  const handleDragLeave = () => {
    setDragOverDate(null);
  };

  const handleDrop = (e: React.DragEvent, targetDateStr: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain') || draggedTaskId;
    setDragOverDate(null);
    setDraggedTaskId(null);

    if (!taskId) return;
    const taskToUpdate = tasks.find(t => t.id === taskId);
    if (taskToUpdate && taskToUpdate.dueDate !== targetDateStr) {
      onUpdateTask({ ...taskToUpdate, dueDate: targetDateStr });
    }
  };

  // ----------------------------------------------------
  // Quick Time Adjuster Handler
  // ----------------------------------------------------
  const handleQuickTimeAdjust = (task: Task, minutesToAdd: number) => {
    const [hrs, mins] = (task.dueTime || '09:00').split(':').map(Number);
    const dateObj = new Date();
    dateObj.setHours(hrs, mins + minutesToAdd);
    
    const formattedHrs = String(dateObj.getHours()).padStart(2, '0');
    const formattedMins = String(dateObj.getMinutes()).padStart(2, '0');
    const updatedTime = `${formattedHrs}:${formattedMins}`;

    onUpdateTask({ ...task, dueTime: updatedTime });
  };

  // ----------------------------------------------------
  // Date Grid Calculations
  // ----------------------------------------------------
  const currentSelectedObj = new Date(selectedDate);
  const daysOfWeek = [-2, -1, 0, 1, 2].map((offset) => {
    const d = new Date(currentSelectedObj);
    d.setDate(d.getDate() + offset);
    const dateStr = toLocalDateStr(d);
    const dayName = d.toLocaleDateString(user.language === 'th' ? 'th-TH' : 'en-US', { weekday: 'short' }).toUpperCase();
    const dayNum = d.getDate();
    const hasTasks = tasks.some(t => t.dueDate === dateStr && !t.completed);
    const hasCompleted = tasks.some(t => t.dueDate === dateStr && t.completed);
    return {
      dateStr,
      dayName,
      dayNum,
      isToday: dateStr === toLocalDateStr(new Date()),
      isSelected: dateStr === selectedDate,
      hasTasks,
      hasCompleted
    };
  });

  const currentYear = viewMonthDate.getFullYear();
  const currentMonth = viewMonthDate.getMonth();
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
  const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);
  
  let startDayOfWeek = firstDayOfMonth.getDay() - 1;
  if (startDayOfWeek === -1) startDayOfWeek = 6;

  const totalDaysInMonth = lastDayOfMonth.getDate();
  const monthGridDays: Array<{
    dateStr: string;
    dayNum: number;
    isCurrentMonth: boolean;
    isToday: boolean;
    isSelected: boolean;
    pendingCount: number;
    completedCount: number;
    hasDeadline: boolean;
  }> = [];

  // ⏰ วันไหนมีงานที่มีกำหนดส่ง (ยังไม่เสร็จ) ให้ขึ้นจุดสีแดงเตือนบนกริดปฏิทิน
  const hasDeadlineOn = (dateStr: string) =>
    tasks.some(t => t.dueDate === dateStr && t.eisenhowerQuadrant === 'deadline' && !t.completed);

  const prevMonthLastDay = new Date(currentYear, currentMonth, 0).getDate();
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const dayNum = prevMonthLastDay - i;
    const d = new Date(currentYear, currentMonth - 1, dayNum);
    const dateStr = toLocalDateStr(d);
    const pendingCount = tasks.filter(t => t.dueDate === dateStr && !t.completed).length;
    const completedCount = tasks.filter(t => t.dueDate === dateStr && t.completed).length;
    monthGridDays.push({
      dateStr,
      dayNum,
      isCurrentMonth: false,
      isToday: dateStr === toLocalDateStr(new Date()),
      isSelected: dateStr === selectedDate,
      pendingCount,
      completedCount,
      hasDeadline: hasDeadlineOn(dateStr)
    });
  }

  for (let day = 1; day <= totalDaysInMonth; day++) {
    const d = new Date(currentYear, currentMonth, day);
    const dateStr = toLocalDateStr(d);
    const pendingCount = tasks.filter(t => t.dueDate === dateStr && !t.completed).length;
    const completedCount = tasks.filter(t => t.dueDate === dateStr && t.completed).length;
    monthGridDays.push({
      dateStr,
      dayNum: day,
      isCurrentMonth: true,
      isToday: dateStr === toLocalDateStr(new Date()),
      isSelected: dateStr === selectedDate,
      pendingCount,
      completedCount,
      hasDeadline: hasDeadlineOn(dateStr)
    });
  }

  const remainingCells = (7 - (monthGridDays.length % 7)) % 7;
  for (let day = 1; day <= remainingCells; day++) {
    const d = new Date(currentYear, currentMonth + 1, day);
    const dateStr = toLocalDateStr(d);
    const pendingCount = tasks.filter(t => t.dueDate === dateStr && !t.completed).length;
    const completedCount = tasks.filter(t => t.dueDate === dateStr && t.completed).length;
    monthGridDays.push({
      dateStr,
      dayNum: day,
      isCurrentMonth: false,
      isToday: dateStr === toLocalDateStr(new Date()),
      isSelected: dateStr === selectedDate,
      pendingCount,
      completedCount,
      hasDeadline: hasDeadlineOn(dateStr)
    });
  }

  const monthYearLabel = viewMonthDate.toLocaleDateString(
    user.language === 'th' ? 'th-TH' : 'en-US', 
    { month: 'long', year: 'numeric' }
  );

  const handlePrevMonth = () => setViewMonthDate(new Date(currentYear, currentMonth - 1, 1));
  const handleNextMonth = () => setViewMonthDate(new Date(currentYear, currentMonth + 1, 1));

  const handleSelectDay = (dateStr: string) => {
    setSelectedDate(dateStr);
    const selectedObj = new Date(dateStr);
    setViewMonthDate(new Date(selectedObj.getFullYear(), selectedObj.getMonth(), 1));
  };

  const todayStr = toLocalDateStr(new Date());
  const missedTasks = tasks.filter(t => !t.completed && t.dueDate <= todayStr && (t.dueDate < todayStr || (t.dueTime && t.dueTime < '09:00')));
  const activeTasks = tasks.filter(t => t.dueDate === selectedDate);

  // ----------------------------------------------------
  // 🗓️ Calendar Integration — แยก "กิจกรรมที่มีเวลา" (ลงตามกล่องเวลา)
  // ออกจาก "Habit" (ไม่มีเวลา ขึ้นเป็น Checklist/Badge ประจำวัน)
  // Habit คือ Event ที่ระบบสร้างจาก Routine แบบ flex (ไม่มี dueTime)
  // ----------------------------------------------------
  // Habit คือ Task ที่ไม่มี dueTime (ไม่ระบุเวลา) ไม่ว่าจะมาจาก Routine หรือผู้ใช้เพิ่มเอง
  // (Flex Task ที่เพิ่มเองผ่านฟอร์ม "ไม่ระบุเวลา" จะถูกจัดเข้ากลุ่มนี้เหมือนกัน แสดงเป็น
  // checklist ให้ติ๊กว่าทำแล้วแทนที่จะโชว์เวลา)
  const isHabitTask = (task: Task) => !task.dueTime && task.eisenhowerQuadrant !== 'deadline';
  // ⏰ งานที่มีกำหนดส่ง (Deadline Task) — แยกออกมาต่างหาก ไม่ปนกับ Habit หรือกิจกรรมมีเวลาปกติ
  // เพราะสิ่งสำคัญคือ "เหลือกี่วันถึงจะครบกำหนด" ไม่ใช่ช่วงเวลาในวันนั้น
  const deadlineActiveTasks = activeTasks
    .filter((t) => t.eisenhowerQuadrant === 'deadline')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const habitActiveTasks = activeTasks.filter(isHabitTask);
  const timedActiveTasks = activeTasks.filter((t) => !isHabitTask(t) && t.eisenhowerQuadrant !== 'deadline');

  const handleTriggerAiReschedule = async () => {
    if (missedTasks.length === 0) return;
    setIsRescheduling(true);
    
    try {
      const result = await aiRescheduleMissedTasks(missedTasks, activeTasks, user);
      setProposals(result);
    } catch (e) {
      console.error(e);
    } finally { 
      setIsRescheduling(false);
    }
  };

  const handleApplyProposals = () => {
    if (!proposals) return;
    onRescheduleBatch(proposals);
    setProposals(null);
    confetti({ particleCount: 50, spread: 60, origin: { y: 0.4 } });
  };

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const totalMinutes = (Number(durationHours) * 60) + Number(durationMins);

    onAddTask({
      title: newTitle.trim(),
      description: newDescription.trim() || undefined,
      location: newLocation.trim() || undefined,
      category: newCategory,
      // ไม่ระบุเวลา ➔ dueTime ว่าง '' และไม่มี endTime (เหมือน Flex Habit ที่มาจาก Routine)
      dueTime: newIsFlexTime ? '' : newTime,
      endTime: newIsFlexTime ? undefined : newEndTime,
      durationMinutes: totalMinutes > 0 ? totalMinutes : 15,
      dueDate: selectedDate,
      eisenhowerQuadrant: newQuadrant,
      goalId: newGoalId || undefined,
      completed: false
    });

    setNewTitle('');
    setNewDescription('');
    setNewLocation('');
    setShowAddModal(false);
  };

  const handleCheckTask = (id: string, currentlyCompleted: boolean) => {
    onToggleTask(id);
    if (!currentlyCompleted) {
      confetti({ particleCount: 40, spread: 50, origin: { y: 0.6 } });
    }
  };

  const dayHeaders = user.language === 'th'
    ? ['จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.', 'อา.']
    : ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

  return (
    <div className="pb-24 pt-3 px-4 max-w-md mx-auto space-y-4">
      {/* 🎯 Top Header Row */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={openMonthPicker}
          className="relative flex-1 flex items-center justify-between bg-white px-3.5 py-2 doodle-border-sm doodle-shadow-sm font-['Bricolage_Grotesque'] text-sm md:text-base font-black doodle-btn transition-all hover:bg-gray-50 cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-black shrink-0" />
            <span className="capitalize">{monthYearLabel}</span>
          </div>
          <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />

          <input
            ref={monthInputRef}
            type="month"
            value={formattedMonthValue}
            onChange={handleMonthInputChange}
            className="absolute opacity-0 pointer-events-none w-0 h-0 inset-0"
          />
        </button>

        <button
          onClick={() => setCalendarViewMode(calendarViewMode === 'week' ? 'month' : 'week')}
          className={`h-10 px-3 doodle-border-sm doodle-shadow-sm flex items-center justify-center gap-1 text-xs font-black doodle-btn transition-colors ${
            calendarViewMode === 'month' ? 'bg-accent' : 'bg-white hover:bg-gray-50'
          }`}
          title="Toggle Month/Week View"
        >
          {calendarViewMode === 'week' ? <LayoutGrid className="w-4 h-4" /> : <Layers className="w-4 h-4" />}
        </button>

        <button 
          onClick={() => handleSelectDay(toLocalDateStr(new Date()))}
          className="h-10 px-3 bg-white doodle-border-sm doodle-shadow-sm flex items-center justify-center text-xs font-extrabold doodle-btn hover:bg-gray-50"
          title="Today"
        >
          Today
        </button>
      </div>

      {/* 🎯 VIEW MODE 1: Horizontal Week Strip */}
      {calendarViewMode === 'week' && (
        <div className="grid grid-cols-5 gap-2">
          {daysOfWeek.map((day) => (
            <button
              key={day.dateStr}
              onClick={() => setSelectedDate(day.dateStr)}
              onDragOver={(e) => handleDragOver(e, day.dateStr)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, day.dateStr)}
              className={`flex flex-col items-center py-2.5 px-1 doodle-border-sm doodle-btn relative transition-all ${
                dragOverDate === day.dateStr
                  ? 'bg-emerald-100 border-dashed border-emerald-600 scale-105 z-20'
                  : day.isSelected
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

              <div className="flex gap-1 mt-1">
                {day.hasTasks && <div className="w-1.5 h-1.5 rounded-full bg-[#FF4D4D]" />}
                {day.hasCompleted && <div className="w-1.5 h-1.5 rounded-full bg-[#9DD9D2]" />}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* 🎯 VIEW MODE 2: Full Month Grid View */}
      {calendarViewMode === 'month' && (
        <div className="bg-white doodle-border doodle-shadow p-3.5 space-y-2.5 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between pb-2 border-b-2 border-black">
            <button
              onClick={handlePrevMonth}
              className="p-1.5 bg-gray-100 hover:bg-[var(--accent-color)] doodle-border-sm doodle-btn"
              title={t.prevMonth}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-extrabold text-sm font-['Bricolage_Grotesque']">
              {monthYearLabel}
            </span>
            <button
              onClick={handleNextMonth}
              className="p-1.5 bg-gray-100 hover:bg-[var(--accent-color)] doodle-border-sm doodle-btn"
              title={t.nextMonth}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-black text-gray-600 uppercase">
            {dayHeaders.map((dh, i) => (
              <div key={i} className="py-1">
                {dh}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {monthGridDays.map((cell, idx) => {
              const isSelected = cell.dateStr === selectedDate;
              const isHovered = dragOverDate === cell.dateStr;
              return (
                <button
                  key={idx}
                  onClick={() => handleSelectDay(cell.dateStr)}
                  onDragOver={(e) => handleDragOver(e, cell.dateStr)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, cell.dateStr)}
                  className={`min-h-[42px] p-1 rounded doodle-border-sm flex flex-col items-center justify-between transition-all relative ${
                    isHovered
                      ? 'bg-emerald-100 border-dashed border-emerald-600 scale-105 z-20'
                      : isSelected
                      ? 'bg-accent doodle-shadow-sm font-black border-[2.5px] scale-105 z-10'
                      : cell.isToday
                      ? 'bg-[#E6D4F9] border-black font-extrabold'
                      : cell.isCurrentMonth
                      ? 'bg-white hover:bg-gray-100 font-bold text-black'
                      : 'bg-gray-50 opacity-40 text-gray-400'
                  }`}
                >
                  {cell.hasDeadline && (
                    <span
                      className="absolute -top-1 -right-1 text-[9px] leading-none"
                      title={user.language === 'th' ? 'มีงานกำหนดส่ง' : 'Has a deadline task'}
                    >
                      ⏰
                    </span>
                  )}
                  <span className="text-xs">{cell.dayNum}</span>

                  <div className="flex gap-0.5 mt-0.5">
                    {cell.pendingCount > 0 && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#FF4D4D]" title={`${cell.pendingCount} pending`} />
                    )}
                    {cell.completedCount > 0 && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#9DD9D2]" title={`${cell.completedCount} done`} />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 🎯 Missed Tasks Alert Card */}
      {missedTasks.length > 0 && (
        <div className="bg-[var(--danger-bg-soft)] doodle-border doodle-shadow p-4 relative overflow-hidden transition-all">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-[#FF4D4D] text-white flex items-center justify-center text-xs font-black">
                !
              </div>
              <h3 className="font-extrabold text-sm md:text-base text-[var(--danger-text)]">
                {t.missedTasks} ({missedTasks.length})
              </h3>
            </div>
            <button 
              onClick={() => setIsMissedCollapsed(!isMissedCollapsed)}
              className="p-1 hover:bg-black/10 rounded"
            >
              {isMissedCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          </div>

          {!isMissedCollapsed && (
            <div className="space-y-2 mb-3">
              {missedTasks.map(t => (
                <div key={t.id} className="bg-white/80 doodle-border-sm p-2 text-xs flex justify-between items-center">
                  <span className="font-bold line-clamp-1">{t.title}</span>
                  <span className="text-gray-500 text-[10px] shrink-0">{t.durationMinutes}m • {t.category}</span>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={handleTriggerAiReschedule}
            disabled={isRescheduling}
            className="w-full bg-[var(--ink-solid)] text-white doodle-border border-[var(--ink-black)] py-3 rounded-xl font-extrabold text-sm flex items-center justify-center gap-2 doodle-btn doodle-shadow-sm hover:bg-black"
          >
            <Sparkles className="w-4 h-4 text-[var(--accent-color)] animate-pulse" />
            {isRescheduling ? 'Gemini AI calculating optimal slots...' : `⚡ ${t.aiReschedule}`}
          </button>
        </div>
      )}

      {/* 🎯 AI Reschedule Proposals Modal */}
      {proposals && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[var(--paper-bg)] doodle-border doodle-shadow-lg max-w-md w-full p-5 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b-2 border-black pb-2">
              <div className="flex items-center gap-2">
                <span className="text-xl">⚡</span>
                <h3 className="font-extrabold text-lg font-['Bricolage_Grotesque']">
                  AI Reschedule Suggestions
                </h3>
              </div>
              <button 
                onClick={() => setProposals(null)}
                className="p-1 hover:bg-gray-200 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-gray-700 font-medium">
              Gemini analyzed your chronotype (<strong className="text-black">{user.energyType.replace('_', ' ')}</strong>) and open slots:
            </p>

            <div className="space-y-3">
              {proposals.map((p, idx) => (
                <div key={idx} className="bg-white doodle-border-sm p-3.5 doodle-shadow-sm space-y-1.5">
                  <div className="flex justify-between items-start">
                    <h4 className="font-bold text-sm text-[var(--text-main)]">{p.taskTitle}</h4>
                    <span className="bg-accent text-[10px] font-black px-2 py-0.5 rounded-full border border-black">
                      {p.newTime}
                    </span>
                  </div>
                  <p className="text-xs text-emerald-800 font-semibold italic">
                    💡 {p.reason}
                  </p>
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setProposals(null)}
                className="flex-1 py-2.5 bg-white doodle-border-sm font-bold text-xs doodle-btn"
              >
                {t.cancel}
              </button>
              <button
                onClick={handleApplyProposals}
                className="flex-1 py-2.5 bg-[var(--ink-solid)] text-[var(--accent-color)] doodle-border border-[var(--ink-black)] font-extrabold text-xs doodle-btn flex items-center justify-center gap-1.5"
              >
                <Check className="w-4 h-4" /> Apply All Slots
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🎯 Active Tasks Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight font-['Bricolage_Grotesque']">
              {t.activeTasks}
            </h2>
            <span className="text-[11px] font-bold text-gray-500">
              {selectedDate} ({activeTasks.length} {activeTasks.length === 1 ? 'task' : 'tasks'})
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            {/* ปุ่มสลับมุมมอง รายการ / ไทม์ไลน์เวลา */}
            <button
              onClick={() => setViewMode(viewMode === 'list' ? 'timeline' : 'list')}
              className="p-1.5 bg-white doodle-border-sm doodle-shadow-sm rounded-lg hover:bg-gray-50 transition-all flex items-center justify-center text-xs font-bold"
              title={viewMode === 'list' ? 'สลับเป็นมุมมองไทม์ไลน์' : 'สลับเป็นมุมมองรายการ'}
            >
              {viewMode === 'list' ? (
                <Clock className="w-4 h-4 text-black" />
              ) : (
                <List className="w-4 h-4 text-black" />
              )}
            </button>

            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1 bg-accent px-3 py-1.5 doodle-border-sm doodle-shadow-sm text-xs font-black doodle-btn"
            >
              <Plus className="w-3.5 h-3.5" /> {t.addTask}
            </button>
          </div>
        </div>

        {/* ⏰ Deadline Tasks — งานที่มีกำหนดส่ง แสดงเด่นด้วยการ์ดสีพิเศษ + ตัวนับถอยหลัง */}
        {deadlineActiveTasks.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] font-extrabold text-gray-700 uppercase tracking-wide">
              <Timer className="w-3.5 h-3.5" />
              <span>{user.language === 'th' ? 'งานที่มีกำหนดส่ง' : 'Deadline tasks'}</span>
            </div>
            {deadlineActiveTasks.map((task) => {
              const daysLeft = daysUntil(task.dueDate);
              const urgency = getDeadlineUrgency(daysLeft);
              const accentColor =
                urgency === 'overdue' ? '#FF4D4D' :
                urgency === 'today' ? '#FF9F5A' :
                urgency === 'soon' ? '#FFE66D' : '#9DD9D2';
              return (
                <div
                  key={task.id}
                  className={`bg-white doodle-border doodle-shadow-sm p-3 relative overflow-hidden flex items-center gap-3 ${
                    task.completed ? 'opacity-60 bg-gray-50' : urgency === 'overdue' ? 'bg-red-50' : ''
                  }`}
                >
                  <button
                    onClick={() => handleCheckTask(task.id, task.completed)}
                    className={`w-5 h-5 rounded-md doodle-border-sm shrink-0 flex items-center justify-center transition-all ${
                      task.completed ? 'bg-[var(--ink-solid)] text-white' : 'bg-white hover:bg-gray-100'
                    }`}
                  >
                    {task.completed && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold leading-snug line-clamp-1 ${
                      task.completed ? 'line-through text-gray-400' : 'text-[var(--text-main)]'
                    }`}>
                      {task.title}
                    </p>
                    <div
                      className="mt-1 inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full border border-black w-fit"
                      style={{ backgroundColor: task.completed ? '#E5E7EB' : accentColor }}
                    >
                      <Timer className="w-3 h-3" />
                      {formatDeadlineCountdown(daysLeft, user.language)}
                    </div>
                  </div>
                  <button
                    onClick={() => onDeleteTask(task.id)}
                    className="text-gray-400 hover:text-red-600 opacity-60 hover:opacity-100 p-1 shrink-0"
                    title="Delete task"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* 🔁 Habit Checklist — กิจกรรมที่เป็น Habit (ไม่มีเวลาตายตัว) ขึ้นเป็น Checklist/Badge
            แยกจากกิจกรรมที่มีเวลา (จะถูกจัดลงกล่องเวลาด้านล่างแทน) */}
        {habitActiveTasks.length > 0 && (
          <div className="bg-white doodle-border doodle-shadow-sm p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] font-extrabold text-gray-700 uppercase tracking-wide">
              <Repeat className="w-3.5 h-3.5" />
              <span>{user.language === 'th' ? 'กิจวัตรวันนี้ (Habits)' : "Today's Habits"}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {habitActiveTasks.map((task) => (
                <button
                  key={task.id}
                  onClick={() => handleCheckTask(task.id, task.completed)}
                  className={`flex items-center gap-1.5 pl-2 pr-3 py-1.5 rounded-full doodle-border-sm text-xs font-bold transition-all ${
                    task.completed ? 'bg-gray-100 text-gray-400 line-through' : 'bg-white hover:bg-gray-50'
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded-full flex items-center justify-center border border-black shrink-0 ${
                      task.completed ? 'bg-black text-white' : 'bg-white'
                    }`}
                  >
                    {task.completed && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                  </span>
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: task.categoryColor || '#ffe66d' }}
                  />
                  {task.title}
                </button>
              ))}
            </div>
          </div>
        )}

        {activeTasks.length === 0 ? (
          <div className="bg-white doodle-border doodle-shadow p-6 text-center space-y-2">
            <span className="text-3xl">☕</span>
            <p className="text-sm font-bold text-gray-700">{t.noTasks}</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="mt-2 bg-[var(--ink-solid)] text-white px-4 py-2 rounded-xl text-xs font-bold doodle-btn inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5 text-[var(--accent-color)]" /> {t.addTask}
            </button>
          </div>
        ) : timedActiveTasks.length === 0 ? (
          /* มี Habit แล้วแต่ยังไม่มีกิจกรรมที่มีเวลาตายตัว */
          <div className="bg-white/60 doodle-border-sm p-4 text-center">
            <p className="text-xs font-bold text-gray-500">
              {user.language === 'th' ? 'ไม่มีกิจกรรมที่มีเวลานัดหมายวันนี้' : 'No time-blocked tasks today'}
            </p>
          </div>
        ) : viewMode === 'list' ? (
          /* 📋 มุมมองรายการปกติ (List View) */
          <div className="space-y-3">
            {timedActiveTasks.map((task) => (
              <div
                key={task.id}
                draggable
                onDragStart={(e) => handleDragStart(e, task.id)}
                className={`bg-white doodle-border doodle-shadow p-4 relative transition-all cursor-grab active:cursor-grabbing ${
                  task.completed ? 'opacity-65 bg-gray-50' : ''
                } ${draggedTaskId === task.id ? 'opacity-40 border-dashed border-gray-400' : ''}`}
              >
                {task.isAiRescheduled && (
                  <div className="absolute -top-3.5 right-4 bg-accent px-3 py-0.5 doodle-border-sm border-b-0 rounded-t-lg font-black text-[10px] flex items-center gap-1 shadow-[2px_0px_0px_var(--ink-black)]">
                    <Sparkles className="w-3 h-3" /> AI {task.dueTime}
                  </div>
                )}

                <div className="flex items-start gap-3">
                  <button
                    onClick={() => handleCheckTask(task.id, task.completed)}
                    className={`w-6 h-6 rounded-md doodle-border-sm shrink-0 mt-0.5 flex items-center justify-center transition-all ${
                      task.completed ? 'bg-[var(--ink-solid)] text-white' : 'bg-white hover:bg-gray-100'
                    }`}
                  >
                    {task.completed && <Check className="w-4 h-4 stroke-[3]" />}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className={`font-bold text-base leading-snug line-clamp-1 ${
                        task.completed ? 'line-through text-gray-500' : 'text-[var(--text-main)]'
                      }`}>
                        {task.title}
                      </h3>
                      <button 
                        onClick={() => onDeleteTask(task.id)}
                        className="text-gray-400 hover:text-red-600 opacity-60 hover:opacity-100 p-1"
                        title="Delete task"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {task.description && (
                      <p className="text-xs text-gray-600 line-clamp-1 mt-0.5">
                        {task.description}
                      </p>
                    )}

                    {task.location && (
                      <p className="text-xs text-gray-500 line-clamp-1 mt-0.5 flex items-center gap-1">
                        <MapPin className="w-3 h-3 shrink-0" />
                        {task.location}
                      </p>
                    )}

                    <div className="flex items-center justify-between mt-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span 
                          className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md border border-black"
                          style={{ backgroundColor: task.categoryColor || '#b0beff' }}
                        >
                          {task.category}
                        </span>

                        <span className="text-[10px] font-bold bg-gray-100 px-1.5 py-0.5 rounded border border-gray-400 text-gray-700">
                          {task.eisenhowerQuadrant.toUpperCase()}
                        </span>

                        {task.isRoutineGenerated && (
                          <span
                            className="text-[10px] font-extrabold flex items-center gap-0.5 bg-white px-1.5 py-0.5 rounded border border-gray-400 text-gray-700"
                            title={user.language === 'th' ? 'สร้างจากกิจวัตร' : 'From a routine'}
                          >
                            <Repeat className="w-2.5 h-2.5" /> {user.language === 'th' ? 'กิจวัตร' : 'Routine'}
                          </span>
                        )}
                      </div>

                      <div className="text-right flex items-center gap-1.5">
                        <div className="text-xs font-bold text-gray-700 flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{task.dueTime || 'Anytime'} ({task.durationMinutes}m)</span>
                        </div>

                        {!task.completed && (
                          <div className="flex items-center gap-1 ml-1">
                            <button
                              type="button"
                              onClick={() => handleQuickTimeAdjust(task, 15)}
                              className="px-1.5 py-0.5 text-[10px] font-black bg-gray-100 hover:bg-[var(--accent-color)] doodle-border-sm rounded transition-colors"
                              title="Add 15 Minutes"
                            >
                            
                            </button>
                            <button
                              type="button"
                              onClick={() => handleQuickTimeAdjust(task, 60)}
                              className="px-1.5 py-0.5 text-[10px] font-black bg-gray-100 hover:bg-[var(--accent-color)] doodle-border-sm rounded transition-colors"
                              title="Add 1 Hour"
                            >
                            
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* ⏱️ มุมมองตารางเวลา (Timeline View) */
          <div className="bg-white doodle-border doodle-shadow p-3 rounded-2xl max-h-[500px] overflow-y-auto">
            <div className="relative">
              {timeSlots.map((hour) => {
                const timeString = `${hour.toString().padStart(2, '0')}:00`;
                const tasksInSlot = timedActiveTasks.filter(
                  (t) => t.dueTime && t.dueTime.startsWith(`${hour.toString().padStart(2, '0')}:`)
                );

                return (
                  <div key={hour} className="flex gap-3 text-xs border-b border-gray-100 min-h-[48px] relative">
                    <div className="w-12 font-mono font-bold text-gray-400 shrink-0 pt-2">
                      {timeString}
                    </div>

                    <div className="flex-1 border-l-2 border-dashed border-gray-200 pl-3 py-1 relative min-h-[48px]">
                      {tasksInSlot.length > 0 ? (
                        tasksInSlot.map((task) => {
                          const heightPx = Math.max(40, (task.durationMinutes / 60) * 48);

                          return (
                            <div
                              key={task.id}
                              style={{ height: `${heightPx - 4}px` }}
                              className={`doodle-border-sm p-2 rounded-lg font-bold text-black flex items-center justify-between absolute left-3 right-0 z-10 transition-all ${
                                task.completed ? 'bg-gray-100 line-through opacity-70' : 'bg-accent'
                              }`}
                            >
                              <div className="flex items-center gap-2 overflow-hidden">
                                <button
                                  onClick={() => handleCheckTask(task.id, task.completed)}
                                  className={`w-4 h-4 rounded doodle-border-sm flex items-center justify-center shrink-0 ${
                                    task.completed ? 'bg-black text-white' : 'bg-white'
                                  }`}
                                >
                                  {task.completed && <Check className="w-3 h-3 stroke-[3]" />}
                                </button>
                                <span className="truncate flex items-center gap-1">
                                  {task.dueTime}-{getTaskEndTime(task)} - {task.title}
                                  {task.isRoutineGenerated && (
                                    <Repeat
                                      className="w-3 h-3 shrink-0 opacity-70"
                                      title={user.language === 'th' ? 'สร้างจากกิจวัตร' : 'From a routine'}
                                    />
                                  )}
                                </span>
                              </div>
                              <span className="text-[10px] font-normal shrink-0 ml-1">({task.durationMinutes}m)</span>
                            </div>
                          );
                        })
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 🎯 Add Task Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white doodle-border doodle-shadow-lg max-w-md w-full p-5 space-y-4">
            <div className="flex justify-between items-center border-b-2 border-black pb-2">
              <h3 className="font-extrabold text-lg font-['Bricolage_Grotesque']">
                {t.addTask}
              </h3>
              <button 
                onClick={() => setShowAddModal(false)}
                className="p-1 hover:bg-gray-100 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-3 text-xs font-bold">
              <div>
                <label className="block mb-1 text-gray-700">Task Title</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Read Chapter 4"
                  className="w-full px-3 py-2 doodle-border-sm focus:outline-none focus:bg-amber-50"
                />
              </div>

              <div>
                <label className="block mb-1 text-gray-700">{t.taskDescription}</label>
                <input
                  type="text"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder={t.taskDescriptionPlaceholder}
                  className="w-full px-3 py-2 doodle-border-sm focus:outline-none focus:bg-amber-50 font-normal"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block mb-1 text-gray-700">Category</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="w-full px-2 py-2 doodle-border-sm bg-white"
                  >
                    <option value="STUDY">Study</option>
                    <option value="WORK">Work</option>
                    <option value="HEALTH">Health</option>
                    <option value="PERSONAL">Personal</option>
                    <option value="HOME_FAMILY">Home &amp; Family</option>
                    <option value="EVENTS">Events</option>
                    <option value="FINANCE">Finance</option>
                  </select>
                </div>

                <div>
                  <label className="block mb-1 text-gray-700">Quadrant</label>
                  <select
                    value={newQuadrant}
                    onChange={(e) => setNewQuadrant(e.target.value as any)}
                    className="w-full px-2 py-2 doodle-border-sm bg-white"
                  >
                    <option value="now">Do Now (Urgent & Important)</option>
                    <option value="plan">Schedule (Important)</option>
                    <option value="quick">Delegate / Quick</option>
                    <option value="chill">Don't Do / Chill</option>
                    <option value="deadline">⏰ {user.language === 'th' ? 'มีกำหนดส่ง (Deadline)' : 'Deadline'}</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 doodle-border-sm bg-gray-50 px-3 py-2">
                <label htmlFor="new-task-flex-time" className="text-gray-700">
                  {user.language === 'th' ? 'ไม่ระบุเวลา' : 'No specific time'}
                </label>
                <button
                  type="button"
                  id="new-task-flex-time"
                  onClick={() => setNewIsFlexTime((prev) => !prev)}
                  className={`shrink-0 w-9 h-5 rounded-full doodle-btn transition-colors relative ${
                    newIsFlexTime ? 'bg-accent' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white border border-black transition-transform ${
                      newIsFlexTime ? 'translate-x-4' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>

              {!newIsFlexTime && (
                <div className="flex flex-wrap gap-2">
                  <div className="flex-1 min-w-[132px]">
                    <label className="block mb-1 text-gray-700">Start Time</label>
                    <input
                      type="time"
                      value={newTime}
                      onChange={(e) => handleStartTimeChange(e.target.value)}
                      className="doodle-time-input doodle-border-sm bg-white"
                    />
                  </div>

                  <div className="flex-1 min-w-[132px]">
                    <label className="block mb-1 text-gray-700">End Time</label>
                    <input
                      type="time"
                      value={newEndTime}
                      onChange={(e) => handleEndTimeChange(e.target.value)}
                      className="doodle-time-input doodle-border-sm bg-white"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  {/* 🔹 แยกส่วนใส่ระยะเวลา Hours / Mins — ผูกกับ Start/End Time ด้านบน */}
                  <label className="block mb-1 text-gray-700">Duration</label>
                  <div className="flex gap-1 items-center">
                    <div className="flex-1">
                      <input
                        type="number"
                        min="0"
                        max="24"
                        placeholder="0"
                        value={durationHours}
                        onChange={(e) => handleDurationHoursChange(Math.max(0, Number(e.target.value)))}
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
                        placeholder="30"
                        value={durationMins}
                        onChange={(e) => handleDurationMinsChange(Math.max(0, Number(e.target.value)))}
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
                    value={newLocation}
                    onChange={(e) => setNewLocation(e.target.value)}
                    placeholder={t.taskLocationPlaceholder}
                    className="w-full px-3 py-2 doodle-border-sm bg-white focus:outline-none focus:bg-amber-50 font-normal h-[38px]"
                  />
                </div>
              </div>

              {goals.length > 0 && (
                <div>
                  <label className="block mb-1 text-gray-700">Link to Goal (Optional)</label>
                  <select
                    value={newGoalId}
                    onChange={(e) => setNewGoalId(e.target.value)}
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
                  onClick={() => setShowAddModal(false)}
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
    </div>
  );
};