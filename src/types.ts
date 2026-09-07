export type EnergyType = 'morning_owl' | 'afternoon_lion' | 'night_owl' | 'deep_night';
export type ThemeAccent = 'yellow' | 'coral' | 'sky' | 'mint' | 'blue';
export type Language = 'en' | 'th';
// 🗓️ 'deadline' = งานที่มีกำหนดส่ง (Deadline Task) — ประเภทงานพิเศษเพิ่มเติมจาก 4 Quadrant เดิม
// ใช้ dueDate เดิมเป็น "วันครบกำหนดส่ง" และคำนวณตัวนับถอยหลังจากค่านี้โดยตรง ไม่ต้องมีฟิลด์ใหม่
export type EisenhowerQuadrant = 'now' | 'plan' | 'quick' | 'chill' | 'deadline';
export type GoalType = 'short_term' | 'long_term';
export type Timeframe = 'daily' | 'weekly' | 'monthly' | 'yearly';
export type GoalCategory = 'study' | 'work' | 'fitness' | 'finance' | 'personal';
export type MoodType = 'none' | 'high_energy' | 'feeling_good' | 'tired' | 'overwhelmed';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
  energyType: EnergyType;
  peakHours: string; // e.g. "08:00 - 12:00"
  themeAccent: ThemeAccent;
  darkMode: boolean;
  language: Language;
  dailyFreeHoursTarget: number; // e.g. 3.5
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  location?: string; // สถานที่ (ไม่บังคับ) เช่น "ห้องสมุด", "ห้อง 204"
  category: string; // 'DATABASE' | 'MEETING' | 'STUDY' | 'WORK' | 'FITNESS' | 'UNWIND' | 'HOME_FAMILY' | 'EVENTS' | 'FINANCE' | etc.
  categoryColor?: string;
  eisenhowerQuadrant: EisenhowerQuadrant;
  dueDate: string; // YYYY-MM-DD
  dueTime: string; // "09:00"
  endTime?: string; // "09:30"
  durationMinutes: number;
  completed: boolean;
  completedAt?: string;
  goalId?: string; // Connected goal
  isAiRescheduled?: boolean;
  originalTime?: string; // "10:00" if rescheduled
  rescheduleReason?: string;
  tags?: string[];
  createdAt: string;
  updatedAt?: string;
  // 🔁 Routine Generation Engine — เมื่อ Task ถูกสร้างจาก Routine (ไม่ใช่สร้างมือ)
  routineId?: string; // อ้างอิงกลับไปยัง Routine.id ที่เป็นต้นกำเนิดของ Event นี้ (ไม่มีค่า = สร้างเองโดยผู้ใช้)
  isRoutineGenerated?: boolean; // true = ระบบสร้างให้อัตโนมัติจาก Routine
}

// CalendarEvent คือ Task ที่ถูกลงบนตารางปฏิทินในวันใดวันหนึ่ง
// ในระบบนี้ CalendarEvent กับ Task ใช้โครงสร้างเดียวกัน (Event ที่มาจาก Routine
// ก็คือ Task ปกติที่มี routineId/isRoutineGenerated กำกับไว้) จึงไม่ต้องแยก collection ใหม่
export type CalendarEvent = Task;

export interface Goal {
  id: string;
  title: string;
  description?: string;
  goalType: GoalType;
  timeframe: Timeframe;
  category: GoalCategory;
  categoryIcon?: string; // '📚' | '💼' | '🏃' | '💰'
  targetDate?: string;
  progressPercent: number; // 0 - 100
  currentCount?: number;
  targetCount?: number;
  unit?: string;
  linkedTaskCount?: number;
  createdAt: string;
  updatedAt?: string;
  completed?: boolean;
  isPinned?: boolean; // เป้าหมายที่เลือกให้แสดงบนหน้า Tasks
}

export type RoutineScheduleType = 'fixed' | 'flex'; // Fixed Time (มีเวลาชัดเจน) | Flex Habit (ไม่มีเวลา แต่ลงตารางไว้)
export type RoutineDurationMode = 'indefinite' | 'date_range'; // ตลอดไป | กำหนดวันเริ่ม-สิ้นสุด
export type RoutineCategory = 'study' | 'health' | 'chore' | 'work' | 'personal';
export type RoutineStatus = 'active' | 'expired'; // active = ปกติ | expired = เลย endDate แล้ว ถูกย้ายเข้า Archive อัตโนมัติ

export interface Routine {
  id: string;
  title: string;
  scheduleType: RoutineScheduleType;
  startTime?: string; // "13:00" — ใช้เมื่อ scheduleType เป็น 'fixed' เท่านั้น
  endTime?: string; // "16:00" — ใช้เมื่อ scheduleType เป็น 'fixed' เท่านั้น
  durationMinutes?: number;
  days: string[]; // ["Mon", "Wed", "Fri"] — วันในสัปดาห์ที่ทำกิจวัตรนี้
  durationMode: RoutineDurationMode;
  startDate?: string; // YYYY-MM-DD — ใช้เมื่อ durationMode เป็น 'date_range' เท่านั้น
  endDate?: string; // YYYY-MM-DD — ใช้เมื่อ durationMode เป็น 'date_range' เท่านั้น
  category: RoutineCategory;
  active: boolean;
  // 🗂️ Lifecycle & Categories — จัดการการหมดอายุของ Routine
  status?: RoutineStatus; // ค่าเริ่มต้นถือว่าเป็น 'active' ถ้าไม่ระบุ ระบบจะตั้งเป็น 'expired' อัตโนมัติเมื่อเลย endDate
  expiredAcknowledged?: boolean; // ผู้ใช้กดรับทราบ/ปิด popup แจ้งเตือนหมดอายุของ Routine นี้แล้ว
  // 🗓️ วันที่ผู้ใช้ลบ Event ของ Routine นี้ออกไปเฉพาะวันนั้น (ไม่ได้ลบทั้ง Routine)
  // เก็บเป็น "YYYY-MM-DD" — Generation Engine จะข้ามวันเหล่านี้ไป ไม่สร้าง Event ซ้ำกลับมาอีก
  excludedDates?: string[];
  createdAt: string;
  updatedAt?: string;
}

export interface JournalEntry {
  id: string;
  mood: MoodType;
  content: string;
  aiHealingMessage?: string;
  date: string; // YYYY-MM-DD
  createdAt: string;
  updatedAt?: string;
  tags?: string[];
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
  quickAction?: {
    type: 'add_task' | 'reschedule' | 'unwind' | 'open_goal' | 'edit_task' | 'delete_task';
    payload?: any;
    label: string;
  };
}

export interface UnwindActivity {
  id: string;
  title: string;
  type: 'chill' | 'micro_goal';
  category: string;
  durationMinutes: number;
  icon: string;
  badgeColor: string;
  description: string;
}

export type ActiveTab = 'calendar' | 'tasks' | 'chat' | 'myspace' | 'settings' | 'goals_flow' | 'groups';
export type MySpaceSubTab = 'overview' | 'journal' | 'unwind';
