import { enablePushNotifications } from '../../lib/messaging';
import React, { useState } from 'react';
import { User as FirebaseUser } from 'firebase/auth';
import { UserProfile, ThemeAccent, Language, EnergyType, Goal, Routine, RoutineScheduleType, RoutineDurationMode, RoutineCategory } from '../../types';
import { useTranslation } from '../../utils/translations';
import { backupService } from '../../services/backupService';
import { getLocalTodayStr } from '../../utils/date';
import { getArchivedRoutines } from '../../utils/routineEngine';
import { ProfileView } from './ProfileView';
import { 
  ChevronDown, 
  ChevronUp, 
  Smartphone, 
  Check, 
  Download, 
  Upload,
  LogOut,
  Plus,
  Pencil,
  Trash2,
  RotateCcw,
  Archive,
  X,
  Info,
  AlertTriangle
} from 'lucide-react';
import confetti from 'canvas-confetti';

// เลขเวอร์ชันของแอป — แก้ตรงนี้ทุกครั้งที่ปล่อยอัปเดตใหม่
const APP_VERSION = '0.3.0';

interface SettingsViewProps {
  user: UserProfile;
  goals?: Goal[];
  routines?: Routine[];
  authUser?: FirebaseUser | null;
  onUpgradeGoogle?: () => Promise<void>;
  onUpgradeEmail?: (email: string, pass: string) => Promise<void>;
  onUpdateUser: (updated: Partial<UserProfile>) => void;
  onNavigateToGoals: () => void;
  onAddRoutine?: (routine: Partial<Routine>) => void;
  onUpdateRoutine?: (routine: Routine) => void;
  onDeleteRoutine?: (routineId: string) => void;
  onToggleRoutineActive?: (routineId: string) => void;
  onRenewRoutine?: (routineId: string) => void;
  onLogout?: () => void;
  // 🗑️ เรียกเมื่อผู้ใช้ยืนยันลบบัญชีตัวเองแล้ว (parent เป็นคนจัดการลบข้อมูล/เรียก API จริง)
  onDeleteAccount?: () => void;
}

// 🔹 ตัวเลือกวันในสัปดาห์ (แสดงย่อภาษาไทย เก็บค่าจริงเป็นภาษาอังกฤษ)
const DAYS_OF_WEEK: Array<{ id: string; label: string }> = [
  { id: 'Mon', label: 'จ.' },
  { id: 'Tue', label: 'อ.' },
  { id: 'Wed', label: 'พ.' },
  { id: 'Thu', label: 'พฤ.' },
  { id: 'Fri', label: 'ศ.' },
  { id: 'Sat', label: 'ส.' },
  { id: 'Sun', label: 'อา.' }
];

// 🔹 หมวดหมู่กิจวัตร
const ROUTINE_CATEGORIES: Array<{ id: RoutineCategory; label: string; icon: string }> = [
  { id: 'study', label: 'เรียน', icon: '📚' },
  { id: 'health', label: 'สุขภาพ', icon: '💪' },
  { id: 'chore', label: 'งานบ้าน', icon: '🧹' },
  { id: 'work', label: 'งาน', icon: '💼' },
  { id: 'personal', label: 'ส่วนตัว', icon: '🌱' }
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  user,
  goals = [],
  routines = [],
  authUser,
  onUpgradeGoogle,
  onUpgradeEmail,
  onUpdateUser,
  onNavigateToGoals,
  onAddRoutine,
  onUpdateRoutine,
  onDeleteRoutine,
  onToggleRoutineActive,
  onRenewRoutine,
  onLogout,
  onDeleteAccount
}) => {
  const t = useTranslation(user.language);

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>('display');
  const [syncMessage, setSyncMessage] = useState('');
  const [installPrompt, setInstallPrompt] = useState<any>(null);

  // --- App Version / Update Notes Popup ---
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [updateNotes, setUpdateNotes] = useState<string>('');
  const [isLoadingUpdateNotes, setIsLoadingUpdateNotes] = useState(false);
  const [updateNotesError, setUpdateNotesError] = useState(false);

  // --- Delete Account Confirmation Popup ---
  const [showDeleteAccountConfirm, setShowDeleteAccountConfirm] = useState(false);

  const handleConfirmDeleteAccount = () => {
    onDeleteAccount?.();
    setShowDeleteAccountConfirm(false);
  };

  const handleOpenUpdateModal = async () => {
    setShowUpdateModal(true);
    setIsLoadingUpdateNotes(true);
    setUpdateNotesError(false);
    try {
      // ดึงข้อความจากไฟล์ /public/update.txt — แก้ไฟล์นั้นเพื่อเปลี่ยนข้อความที่แสดงในป็อปอัพนี้
      const res = await fetch(`/update.txt?t=${Date.now()}`);
      if (!res.ok) throw new Error('update.txt not found');
      const text = await res.text();
      setUpdateNotes(text);
    } catch (err) {
      setUpdateNotesError(true);
    } finally {
      setIsLoadingUpdateNotes(false);
    }
  };

  // ----------------------------------------------------
  // Routine Form Modal State (สร้าง/แก้ไขกิจวัตร)
  // ----------------------------------------------------
  const [isRoutineModalOpen, setIsRoutineModalOpen] = useState(false);
  const [editingRoutineId, setEditingRoutineId] = useState<string | null>(null);
  const [routineTitle, setRoutineTitle] = useState('');
  const [routineScheduleType, setRoutineScheduleType] = useState<RoutineScheduleType>('fixed');
  const [routineStartTime, setRoutineStartTime] = useState('09:00');
  const [routineEndTime, setRoutineEndTime] = useState('10:00');
  const [routineDays, setRoutineDays] = useState<string[]>(['Mon']);
  const [routineDurationMode, setRoutineDurationMode] = useState<RoutineDurationMode>('indefinite');
  const [routineStartDate, setRoutineStartDate] = useState(getLocalTodayStr());
  const [routineEndDate, setRoutineEndDate] = useState(getLocalTodayStr());
  const [routineCategory, setRoutineCategory] = useState<RoutineCategory>('personal');

  const resetRoutineForm = () => {
    setRoutineTitle('');
    setRoutineScheduleType('fixed');
    setRoutineStartTime('09:00');
    setRoutineEndTime('10:00');
    setRoutineDays(['Mon']);
    setRoutineDurationMode('indefinite');
    setRoutineStartDate(getLocalTodayStr());
    setRoutineEndDate(getLocalTodayStr());
    setRoutineCategory('personal');
  };

  const openAddRoutineModal = () => {
    resetRoutineForm();
    setEditingRoutineId(null);
    setIsRoutineModalOpen(true);
  };

  const openEditRoutineModal = (routine: Routine) => {
    setEditingRoutineId(routine.id);
    setRoutineTitle(routine.title);
    setRoutineScheduleType(routine.scheduleType);
    setRoutineStartTime(routine.startTime || '09:00');
    setRoutineEndTime(routine.endTime || '10:00');
    setRoutineDays(routine.days && routine.days.length > 0 ? routine.days : ['Mon']);
    setRoutineDurationMode(routine.durationMode);
    setRoutineStartDate(routine.startDate || getLocalTodayStr());
    setRoutineEndDate(routine.endDate || getLocalTodayStr());
    setRoutineCategory(routine.category);
    setIsRoutineModalOpen(true);
  };

  const closeRoutineModal = () => {
    setIsRoutineModalOpen(false);
    setEditingRoutineId(null);
  };

  // 🔹 กดเลือก/ยกเลิกวันในสัปดาห์ (เลือกได้พร้อมกันหลายวัน)
  const toggleRoutineDay = (dayId: string) => {
    setRoutineDays((prev) =>
      prev.includes(dayId) ? prev.filter((d) => d !== dayId) : [...prev, dayId]
    );
  };

  const timeToMinutes = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };

  const handleSaveRoutine = (e: React.FormEvent) => {
    e.preventDefault();
    if (!routineTitle.trim() || routineDays.length === 0) return;

    const payload: Partial<Routine> = {
      title: routineTitle.trim(),
      scheduleType: routineScheduleType,
      startTime: routineScheduleType === 'fixed' ? routineStartTime : undefined,
      endTime: routineScheduleType === 'fixed' ? routineEndTime : undefined,
      durationMinutes:
        routineScheduleType === 'fixed'
          ? Math.max(0, timeToMinutes(routineEndTime) - timeToMinutes(routineStartTime))
          : undefined,
      days: routineDays,
      durationMode: routineDurationMode,
      startDate: routineDurationMode === 'date_range' ? routineStartDate : undefined,
      endDate: routineDurationMode === 'date_range' ? routineEndDate : undefined,
      category: routineCategory
    };

    if (editingRoutineId) {
      const existing = routines.find((r) => r.id === editingRoutineId);
      if (existing && onUpdateRoutine) {
        onUpdateRoutine({ ...existing, ...payload } as Routine);
      }
    } else if (onAddRoutine) {
      onAddRoutine({ ...payload, active: true });
    }

    closeRoutineModal();
  };

  const handleDeleteRoutine = (routineId: string) => {
    if (confirm(user.language === 'th' ? 'ลบกิจวัตรนี้ใช่หรือไม่?' : 'Delete this routine?')) {
      onDeleteRoutine?.(routineId);
    }
  };

  // 🗂️ Lifecycle & Categories — แยก Routine ที่ยัง active ออกจาก Routine ที่หมดอายุแล้ว
  // (status === 'expired' ถูกระบบตั้งอัตโนมัติเมื่อเลย endDate) เพื่อย้ายเข้าหมวด "กิจกรรมที่จบแล้ว"
  const activeRoutinesList = routines.filter((r) => r.status !== 'expired');
  const archivedRoutinesList = getArchivedRoutines(routines);

  const handleRenewRoutine = (routineId: string) => {
    onRenewRoutine?.(routineId);
  };

  React.useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const toggleSection = (section: string) => {
    setOpenSection(openSection === section ? null : section);
  };

  const handleInstallApp = async () => {
    if (installPrompt) {
      installPrompt.prompt();
      const result = await installPrompt.userChoice;
      if (result.outcome === 'accepted') {
        confetti({ particleCount: 60, spread: 70 });
      }
      setInstallPrompt(null);
    } else {
      alert(user.language === 'th'
        ? 'ในการติดตั้ง: แตะที่เมนูเบราว์เซอร์ของคุณ (จุดสามจุด หรือปุ่มแชร์) แล้วเลือก "เพิ่มลงในหน้าจอหลัก (Add to Home Screen)"'
        : 'To install on iOS/Android: Tap your browser Share/Menu button and select "Add to Home Screen".');
    }
  };

  const handleExportBackup = async () => {
    try {
      const json = await backupService.exportDatabaseToJson();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `doodle-life-backup-${getLocalTodayStr()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setSyncMessage('Backup exported from Firebase to a local JSON file.');
    } catch (err) {
      console.error('Export failed:', err);
      alert(user.language === 'th' ? 'ส่งออกข้อมูลไม่สำเร็จ กรุณาลองใหม่' : 'Failed to export backup. Please try again.');
    }
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      if (content) {
        const ok = await backupService.importDatabaseFromJson(content);
        if (ok) {
          alert('Data restored successfully! Refreshing...');
          window.location.reload();
        } else {
          alert('Failed to parse backup JSON.');
        }
      }
    };
    reader.readAsText(file);
  };

  if (isEditingProfile) {
    return (
      <ProfileView
        user={user}
        goals={goals}
        authUser={authUser}
        onUpgradeGoogle={onUpgradeGoogle}
        onUpgradeEmail={onUpgradeEmail}
        onUpdateProfile={(updatedData) => {
          onUpdateUser(updatedData);
          setIsEditingProfile(false);
        }}
        onBack={() => setIsEditingProfile(false)}
        onLogout={onLogout}
      />
    );
  }

  // ตัวช่วยแปลงค่า darkMode ให้เป็นประเภท string เพื่อเปรียบเทียบใน UI
  const currentThemeMode: 'light' | 'dark' = user.darkMode ? 'dark' : 'light';

  return (
    <div className="pb-28 pt-2 px-4 max-w-md mx-auto space-y-4">

      {/* User Profile Card */}
      <div className="bg-accent doodle-border doodle-shadow p-5 relative overflow-hidden text-[#1A1A1A]">
        <div className="flex items-center gap-4">
          <div className="relative">
            <img
              src={user.avatarUrl}
              alt={user.name}
              className="w-16 h-16 rounded-full object-cover doodle-border-sm border-2 border-black bg-white"
            />
            <button
              onClick={() => setIsEditingProfile(true)}
              className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-white doodle-border-sm flex items-center justify-center text-xs shadow-[1px_1px_0px_var(--ink-black)] hover:scale-110 transition-transform text-black"
              title="Edit Profile"
            >
              ✏️
            </button>
          </div>

          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-black font-['Bricolage_Grotesque'] text-[#1A1A1A] truncate">
              {user.name}
            </h2>

            <div className="mt-1.5 inline-block">
              <select
                value={user.energyType}
                onChange={(e) => {
                  const type = e.target.value as EnergyType;
                  const peak = type === 'morning_owl' ? '08:00 - 12:00' : type === 'afternoon_lion' ? '13:00 - 17:00' : type === 'night_owl' ? '19:00 - 23:00' : '00:00 - 04:00';
                  onUpdateUser({ energyType: type, peakHours: peak });
                }}
                className="bg-white text-black text-[11px] font-extrabold px-2.5 py-1 rounded-full border-2 border-black doodle-shadow-sm cursor-pointer"
              >
                <option value="morning_owl">🌅 Morning Owl (08:00 - 12:00)</option>
                <option value="afternoon_lion">🦁 Afternoon Lion (13:00 - 17:00)</option>
                <option value="night_owl">🌙 Night Owl (19:00 - 23:00)</option>
                <option value="deep_night">🦉 Deep Night (00:00 - 04:00)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Accordion 1: Display & Language */}
      <div className="bg-white dark:bg-[#1e293b] doodle-border doodle-shadow overflow-hidden transition-colors">
        <button
          onClick={() => toggleSection('display')}
          className="w-full p-4 flex items-center justify-between font-extrabold text-sm font-['Space_Grotesk'] text-gray-900 dark:text-gray-100"
        >
          <span>{t.displayAndLanguage}</span>
          {openSection === 'display' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {openSection === 'display' && (
          <div className="p-4 pt-1 border-t-2 border-black dark:border-slate-700 space-y-4 text-xs font-bold">
            {/* Appearance Segmented Control */}
            <div>
              <span className="text-gray-600 dark:text-gray-400 mb-2 block">{t.appearance}</span>
              <div className="flex bg-gray-100 dark:bg-[#0f172a] doodle-border-sm p-1 gap-1">
                {[
                  { id: 'light', value: false, label: t.light },
                  { id: 'dark', value: true, label: t.dark }
                ].map((item) => {
                  const isSelected = currentThemeMode === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => onUpdateUser({ darkMode: item.value as any })}
                      className={`flex-1 py-1.5 font-extrabold rounded-lg transition-all ${
                        isSelected
                          ? 'bg-white dark:bg-[#334155] text-black dark:text-white doodle-border-sm doodle-shadow-sm'
                          : 'text-gray-600 dark:text-gray-400 hover:text-black dark:hover:text-white'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Theme Accent Dots */}
            <div>
              <span className="text-gray-600 dark:text-gray-400 mb-2 block">{t.themeAccent}</span>
              <div className="flex items-center gap-3">
                {[
                  { id: 'blue', color: '#A8D8FF' },
                  { id: 'yellow', color: '#FFE66D' },
                  { id: 'coral', color: '#FF9F9F' },
                  { id: 'sky', color: '#9DD9D2' },
                  { id: 'mint', color: '#C1E1C1' }
                ].map((accent) => {
                  const isSelected = user.themeAccent === accent.id;
                  return (
                    <button
                      key={accent.id}
                      onClick={() => onUpdateUser({ themeAccent: accent.id as ThemeAccent })}
                      className={`w-8 h-8 rounded-full border-2 border-black dark:border-white flex items-center justify-center doodle-btn ${
                        isSelected ? 'scale-110 ring-2 ring-black dark:ring-white' : ''
                      }`}
                      style={{ backgroundColor: accent.color }}
                    >
                      {isSelected && <Check className="w-4 h-4 stroke-[3] text-black" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-dashed border-gray-300 dark:border-slate-700 my-2" />

            {/* Language Selector */}
            <div className="flex items-center justify-between">
              <span className="text-gray-700 dark:text-gray-300">{t.languageLabel}</span>
              <select
                value={user.language}
                onChange={(e) => onUpdateUser({ language: e.target.value as Language })}
                className="bg-white dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 doodle-border-sm p-1.5 text-xs font-black"
              >
                <option value="en">English (EN)</option>
                <option value="th">ไทย (TH)</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Accordion 2: Home Screen Widget & PWA */}
      <div className="bg-white dark:bg-[#1e293b] doodle-border doodle-shadow overflow-hidden transition-colors">
        <button
          onClick={() => toggleSection('widget')}
          className="w-full p-4 flex items-center justify-between font-extrabold text-sm font-['Space_Grotesk'] text-gray-900 dark:text-gray-100"
        >
          <span>{t.homeScreenWidget}</span>
          {openSection === 'widget' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {openSection === 'widget' && (
          <div className="p-4 pt-1 border-t-2 border-black dark:border-slate-700 space-y-3 text-xs">
            <p className="text-gray-700 dark:text-gray-300 font-medium leading-relaxed">
              Install Doodle Life as a standalone Progressive Web App (PWA) on your mobile or desktop home screen for instant offline access and native feel.
            </p>
            <button
              onClick={handleInstallApp}
              className="w-full bg-[var(--ink-solid)] dark:bg-[#0f172a] text-[var(--accent-color)] py-3 doodle-border border-[var(--ink-black)] dark:border-slate-600 rounded-xl font-extrabold text-xs doodle-btn flex items-center justify-center gap-2"
            >
              <Smartphone className="w-4 h-4" /> {t.installAppBtn}
            </button>
          </div>
        )}
      </div>

      {/* Accordion 3: Fixed Schedule & Routine */}
      <div className="bg-white dark:bg-[#1e293b] doodle-border doodle-shadow overflow-hidden transition-colors">
        <button
          onClick={() => toggleSection('routines')}
          className="w-full p-4 flex items-center justify-between font-extrabold text-sm font-['Space_Grotesk'] text-gray-900 dark:text-gray-100"
        >
          <span>{t.fixedScheduleRoutine}</span>
          {openSection === 'routines' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {openSection === 'routines' && (
          <div className="p-4 pt-1 border-t-2 border-black dark:border-slate-700 space-y-2.5 text-xs">
            {activeRoutinesList.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 font-medium text-center py-2">
                {user.language === 'th' ? 'ยังไม่มีกิจวัตร กดปุ่มด้านล่างเพื่อเพิ่ม' : 'No routines yet. Add one below.'}
              </p>
            ) : (
              activeRoutinesList.map((r) => {
                const cat = ROUTINE_CATEGORIES.find((c) => c.id === r.category);
                const dayLabels = r.days
                  .map((d) => DAYS_OF_WEEK.find((dw) => dw.id === d)?.label || d)
                  .join(' ');
                return (
                  <div
                    key={r.id}
                    className={`bg-gray-50 dark:bg-[#0f172a] doodle-border-sm p-2.5 space-y-1.5 ${
                      !r.active ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2 text-gray-800 dark:text-gray-200 min-w-0">
                      <span>{cat?.icon || '📌'}</span>
                      <span className="font-bold truncate">{r.title}</span>
                    </div>

                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="font-black text-[10px] bg-accent text-[#1A1A1A] px-2 py-0.5 rounded border border-black">
                          {r.scheduleType === 'fixed' ? `${r.startTime} - ${r.endTime}` : (user.language === 'th' ? 'ไม่ระบุเวลา' : 'Flex Habit')}
                        </span>
                        <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400">
                          {dayLabels}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditRoutineModal(r)}
                          className="p-1.5 bg-white dark:bg-[#1e293b] doodle-border-sm doodle-btn"
                          title="Edit"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteRoutine(r.id)}
                          className="p-1.5 bg-white dark:bg-[#1e293b] doodle-border-sm doodle-btn text-red-600"
                          title="Delete"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            <button
              type="button"
              onClick={openAddRoutineModal}
              className="w-full py-2.5 bg-accent doodle-border-sm font-black doodle-btn flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> {user.language === 'th' ? 'เพิ่มกิจวัตร' : 'Add Routine'}
            </button>
          </div>
        )}
      </div>
      {/* Accordion: Push Notifications */}
<div className="bg-white dark:bg-[#1e293b] doodle-border doodle-shadow overflow-hidden transition-colors">
  <button
    onClick={() => toggleSection('notifications')}
    className="w-full p-4 flex items-center justify-between font-extrabold text-sm font-['Space_Grotesk'] text-gray-900 dark:text-gray-100"
  >
    <span className="flex items-center gap-2">
      <span>🔔</span>
      <span>{user.language === 'th' ? 'การแจ้งเตือน Push Notification' : 'Push Notifications'}</span>
    </span>
    {openSection === 'notifications' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
  </button>

  {openSection === 'notifications' && (
    <div className="p-4 pt-1 border-t-2 border-black dark:border-slate-700 space-y-3 text-xs">
      <p className="text-gray-600 dark:text-gray-300 font-medium leading-relaxed">
        {user.language === 'th'
          ? 'รับการแจ้งเตือนงานใหม่ ข่าวสารในกลุ่ม หรือรายการที่ได้รับมอบหมายทันที แม้กระทั่งตอนปิดแอป'
          : 'Receive instant notifications for new tasks and group updates even when the app is closed.'}
      </p>

      <button
        onClick={async () => {
          if (!authUser) return;
          const result = await enablePushNotifications(authUser.uid);
          if (result === 'granted') {
            alert(user.language === 'th' ? 'เปิดการแจ้งเตือนสำเร็จ!' : 'Push notifications enabled!');
          } else if (result === 'denied') {
            alert(user.language === 'th' ? 'คุณปฏิเสธการอนุญาตแจ้งเตือน กรุณาเปิดสิทธิ์ในเบราว์เซอร์' : 'Notification permission was denied.');
          } else {
            alert(user.language === 'th' ? 'เบราว์เซอร์หรืออุปกรณ์นี้ไม่รองรับ' : 'Push notifications are unsupported.');
          }
        }}
        className="w-full bg-accent text-[#1A1A1A] py-3 doodle-border-sm font-black text-xs doodle-btn flex items-center justify-center gap-2"
      >
        <span>🔔</span>
        {user.language === 'th' ? 'เปิดการแจ้งเตือนบนอุปกรณ์นี้' : 'Enable Push Notifications'}
      </button>
    </div>
  )}
</div>

      {/* Accordion 3.5: Archive — กิจกรรมที่จบแล้ว (Routine ที่หมดอายุ) */}
      {archivedRoutinesList.length > 0 && (
        <div className="bg-white dark:bg-[#1e293b] doodle-border doodle-shadow overflow-hidden transition-colors">
          <button
            onClick={() => toggleSection('archive')}
            className="w-full p-4 flex items-center justify-between font-extrabold text-sm font-['Space_Grotesk'] text-gray-900 dark:text-gray-100"
          >
            <span className="flex items-center gap-2">
              <Archive className="w-4 h-4" />
              {user.language === 'th' ? 'กิจกรรมที่จบแล้ว (Archive)' : 'Completed / Archive'}
              <span className="text-[10px] font-black bg-gray-200 dark:bg-slate-700 px-1.5 py-0.5 rounded-full">
                {archivedRoutinesList.length}
              </span>
            </span>
            {openSection === 'archive' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {openSection === 'archive' && (
            <div className="p-4 pt-1 border-t-2 border-black dark:border-slate-700 space-y-2.5 text-xs">
              {archivedRoutinesList.map((r) => {
                const cat = ROUTINE_CATEGORIES.find((c) => c.id === r.category);
                const dayLabels = r.days
                  .map((d) => DAYS_OF_WEEK.find((dw) => dw.id === d)?.label || d)
                  .join(' ');
                return (
                  <div
                    key={r.id}
                    className="bg-gray-50 dark:bg-[#0f172a] doodle-border-sm p-2.5 space-y-1.5 opacity-70"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-gray-800 dark:text-gray-200 min-w-0">
                        <span>{cat?.icon || '📌'}</span>
                        <span className="font-bold truncate line-through">{r.title}</span>
                      </div>
                      <span className="shrink-0 text-[9px] font-black uppercase bg-gray-300 dark:bg-slate-600 px-1.5 py-0.5 rounded border border-gray-500">
                        {user.language === 'th' ? 'หมดอายุ' : 'Expired'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400">
                        {dayLabels} {r.endDate ? `· ${user.language === 'th' ? 'สิ้นสุด' : 'ended'} ${r.endDate}` : ''}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleRenewRoutine(r.id)}
                          className="p-1.5 bg-white dark:bg-[#1e293b] doodle-border-sm doodle-btn"
                          title={user.language === 'th' ? 'ตั้งต่อ' : 'Renew'}
                        >
                          <RotateCcw className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteRoutine(r.id)}
                          className="p-1.5 bg-white dark:bg-[#1e293b] doodle-border-sm doodle-btn text-red-600"
                          title="Delete"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Item 4: Goals & Objectives */}
      <button
        onClick={onNavigateToGoals}
        className="w-full bg-white dark:bg-[#1e293b] text-gray-900 dark:text-gray-100 doodle-border doodle-shadow p-4 flex items-center justify-between font-extrabold text-sm font-['Space_Grotesk'] doodle-btn text-left transition-colors"
      >
        <div className="flex items-center gap-2">
          <span>🎯</span>
          <span>{t.goalsAndObjectives}</span>
        </div>
        <span className="text-xs bg-accent text-[#1A1A1A] px-2 py-0.5 rounded border border-black font-black">
          Manage ➔
        </span>
      </button>

      {/* Accordion 6: Local Backup & Restore */}
      <div className="bg-white dark:bg-[#1e293b] doodle-border doodle-shadow overflow-hidden transition-colors">
        <button
          onClick={() => toggleSection('backup')}
          className="w-full p-4 flex items-center justify-between font-extrabold text-sm font-['Space_Grotesk'] text-gray-900 dark:text-gray-100"
        >
          <span>Backup & Restore</span>
          {openSection === 'backup' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {openSection === 'backup' && (
          <div className="p-4 pt-1 border-t-2 border-black dark:border-slate-700 space-y-3 text-xs">
            <p className="text-gray-600 dark:text-gray-300 font-medium">
              Your data lives in Firebase Cloud Firestore and syncs in real time. Export a JSON backup of your cloud data to save a copy, or import one to restore it back to your account.
            </p>

            {syncMessage && (
              <p className="text-xs font-bold text-purple-900 dark:text-purple-200 bg-purple-50 dark:bg-purple-950/50 p-2 rounded border border-purple-300 dark:border-purple-800">
                {syncMessage}
              </p>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleExportBackup}
                className="flex-1 py-2 bg-gray-100 dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 doodle-border-sm font-bold text-[11px] doodle-btn flex items-center justify-center gap-1"
              >
                <Download className="w-3.5 h-3.5" /> Export JSON
              </button>
              <label className="flex-1 py-2 bg-gray-100 dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 doodle-border-sm font-bold text-[11px] doodle-btn flex items-center justify-center gap-1 cursor-pointer text-center">
                <Upload className="w-3.5 h-3.5" /> Import JSON
                <input type="file" accept=".json" onChange={handleImportBackup} className="hidden" />
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Accordion 7: App Info */}
      <div className="bg-white dark:bg-[#1e293b] doodle-border doodle-shadow overflow-hidden transition-colors">
        <button
          onClick={() => toggleSection('info')}
          className="w-full p-4 flex items-center justify-between font-extrabold text-sm font-['Space_Grotesk'] text-gray-900 dark:text-gray-100"
        >
          <span>{t.appInfo}</span>
          {openSection === 'info' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {openSection === 'info' && (
          <div className="p-4 pt-1 border-t-2 border-black dark:border-slate-700 space-y-2 text-xs font-medium text-gray-700 dark:text-gray-300">
            <p>• <strong>PWA Engine:</strong> Service Worker + Manifest v1</p>
            <p>• <strong>Cloud Database:</strong> Firebase Cloud Firestore</p>
            <p>• <strong>Design Archetype:</strong> Neo-Brutalism ("Doodle Theory")</p>
            <p>• <strong>AI Model:</strong> Gemini 3.7 Flash Free Tier</p>

            <button
              onClick={handleOpenUpdateModal}
              className="w-full mt-2 p-2.5 bg-gray-100 dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 doodle-border-sm doodle-btn flex items-center justify-between font-bold text-[11px]"
            >
              <span className="flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5" />
                {user.language === 'th' ? 'เวอร์ชันแอป' : 'App Version'}
              </span>
              <span className="text-gray-500 dark:text-gray-400">v{APP_VERSION} →</span>
            </button>
          </div>
        )}
      </div>

      {/* Log Out Button */}
      <button
        onClick={onLogout}
        className="w-full bg-white dark:bg-[#1e293b] text-[var(--danger-text)] dark:text-red-400 doodle-border border-[var(--danger-text)] dark:border-red-400 p-4 font-black text-sm flex items-center justify-center gap-2 doodle-btn doodle-shadow hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
      >
        <LogOut className="w-4 h-4" /> {t.logout}
      </button>

      {/* Delete Account Button */}
      <button
        onClick={() => setShowDeleteAccountConfirm(true)}
        className="w-full bg-[var(--danger-solid)] dark:bg-red-900 text-white doodle-border border-[var(--danger-text)] dark:border-red-400 p-4 font-black text-sm flex items-center justify-center gap-2 doodle-btn doodle-shadow hover:bg-[var(--danger-solid-hover)] dark:hover:bg-red-800 transition-colors"
      >
        <AlertTriangle className="w-4 h-4" />
        {user.language === 'th' ? 'ลบบัญชีผู้ใช้' : 'Delete Account'}
      </button>

      {/* ✏️ Routine Create/Edit Modal */}
      {isRoutineModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white doodle-border doodle-shadow-lg max-w-md w-full p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b-2 border-black pb-2">
              <h3 className="font-extrabold text-lg font-['Bricolage_Grotesque']">
                {editingRoutineId
                  ? (user.language === 'th' ? 'แก้ไขกิจวัตร' : 'Edit Routine')
                  : (user.language === 'th' ? 'เพิ่มกิจวัตรใหม่' : 'Add New Routine')}
              </h3>
              <button
                type="button"
                onClick={closeRoutineModal}
                className="p-1 hover:bg-gray-100 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRoutine} className="space-y-3 text-xs font-bold">
              {/* ชื่อกิจวัตร */}
              <div>
                <label className="block mb-1 text-gray-700">
                  {user.language === 'th' ? 'ชื่อกิจวัตร' : 'Routine Title'}
                </label>
                <input
                  type="text"
                  required
                  value={routineTitle}
                  onChange={(e) => setRoutineTitle(e.target.value)}
                  placeholder={user.language === 'th' ? 'เช่น อ่านหนังสือก่อนนอน' : 'e.g. Read before bed'}
                  className="w-full px-3 py-2 doodle-border-sm bg-white focus:outline-none focus:bg-amber-50"
                />
              </div>

              {/* 1. ประเภทกิจกรรม: Fixed Time vs Flex Habit */}
              <div>
                <label className="block mb-1 text-gray-700">
                  {user.language === 'th' ? 'ประเภทกิจกรรม' : 'Type'}
                </label>
                <div className="flex bg-gray-100 doodle-border-sm p-1 gap-1">
                  <button
                    type="button"
                    onClick={() => setRoutineScheduleType('fixed')}
                    className={`flex-1 py-1.5 rounded-md text-[11px] font-black transition-colors ${
                      routineScheduleType === 'fixed' ? 'bg-[var(--ink-solid)] text-white' : 'text-gray-600'
                    }`}
                  >
                    {user.language === 'th' ? 'เวลาตายตัว' : 'Fixed Time'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRoutineScheduleType('flex')}
                    className={`flex-1 py-1.5 rounded-md text-[11px] font-black transition-colors ${
                      routineScheduleType === 'flex' ? 'bg-[var(--ink-solid)] text-white' : 'text-gray-600'
                    }`}
                  >
                    {user.language === 'th' ? 'ไม่ระบุเวลา' : 'Flex Habit'}
                  </button>
                </div>

                {routineScheduleType === 'fixed' ? (
                  <div className="flex flex-wrap gap-2 mt-2">
                    <div className="flex-1 min-w-[132px]">
                      <label className="block mb-1 text-gray-700">
                        {user.language === 'th' ? 'เริ่ม' : 'Start'}
                      </label>
                      <input
                        type="time"
                        value={routineStartTime}
                        onChange={(e) => setRoutineStartTime(e.target.value)}
                        className="doodle-time-input doodle-border-sm bg-white"
                      />
                    </div>
                    <div className="flex-1 min-w-[132px]">
                      <label className="block mb-1 text-gray-700">
                        {user.language === 'th' ? 'สิ้นสุด' : 'End'}
                      </label>
                      <input
                        type="time"
                        value={routineEndTime}
                        onChange={(e) => setRoutineEndTime(e.target.value)}
                        className="doodle-time-input doodle-border-sm bg-white"
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-[10px] font-semibold text-gray-500 mt-2">
                    {user.language === 'th'
                      ? 'กิจวัตรนี้ไม่ต้องระบุเวลา แค่ลงไว้ในตารางว่าต้องทำวันไหนบ้าง'
                      : 'No specific time needed — just scheduled on the days below.'}
                  </p>
                )}
              </div>

              {/* 2. วันในสัปดาห์ */}
              <div>
                <label className="block mb-1 text-gray-700">
                  {user.language === 'th' ? 'วันในสัปดาห์' : 'Days of Week'}
                </label>
                <div className="flex gap-1 flex-wrap">
                  {DAYS_OF_WEEK.map((day) => {
                    const isSelected = routineDays.includes(day.id);
                    return (
                      <button
                        key={day.id}
                        type="button"
                        onClick={() => toggleRoutineDay(day.id)}
                        className={`w-9 h-9 rounded-full doodle-border-sm text-[11px] font-black doodle-btn ${
                          isSelected ? 'bg-accent' : 'bg-white text-gray-500'
                        }`}
                      >
                        {day.label}
                      </button>
                    );
                  })}
                </div>
                {routineDays.length === 0 && (
                  <p className="text-[10px] font-semibold text-red-600 mt-1">
                    {user.language === 'th' ? 'เลือกอย่างน้อย 1 วัน' : 'Select at least 1 day'}
                  </p>
                )}
              </div>

              {/* 3. เงื่อนไขระยะเวลา: Indefinite vs Date Range */}
              <div>
                <label className="block mb-1 text-gray-700">
                  {user.language === 'th' ? 'ระยะเวลาของกิจวัตร' : 'Duration'}
                </label>
                <div className="flex bg-gray-100 doodle-border-sm p-1 gap-1">
                  <button
                    type="button"
                    onClick={() => setRoutineDurationMode('indefinite')}
                    className={`flex-1 py-1.5 rounded-md text-[11px] font-black transition-colors ${
                      routineDurationMode === 'indefinite' ? 'bg-[var(--ink-solid)] text-white' : 'text-gray-600'
                    }`}
                  >
                    {user.language === 'th' ? 'ตลอดไป' : 'Indefinite'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRoutineDurationMode('date_range')}
                    className={`flex-1 py-1.5 rounded-md text-[11px] font-black transition-colors ${
                      routineDurationMode === 'date_range' ? 'bg-[var(--ink-solid)] text-white' : 'text-gray-600'
                    }`}
                  >
                    {user.language === 'th' ? 'กำหนดวันที่' : 'Date Range'}
                  </button>
                </div>

                {routineDurationMode === 'date_range' && (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div>
                      <label className="block mb-1 text-gray-700">
                        {user.language === 'th' ? 'วันเริ่มต้น' : 'Start Date'}
                      </label>
                      <input
                        type="date"
                        value={routineStartDate}
                        onChange={(e) => setRoutineStartDate(e.target.value)}
                        className="w-full px-2 py-2 doodle-border-sm bg-white"
                      />
                    </div>
                    <div>
                      <label className="block mb-1 text-gray-700">
                        {user.language === 'th' ? 'วันสิ้นสุด' : 'End Date'}
                      </label>
                      <input
                        type="date"
                        value={routineEndDate}
                        min={routineStartDate}
                        onChange={(e) => setRoutineEndDate(e.target.value)}
                        className="w-full px-2 py-2 doodle-border-sm bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 4. หมวดหมู่ */}
              <div>
                <label className="block mb-1 text-gray-700">
                  {user.language === 'th' ? 'หมวดหมู่' : 'Category'}
                </label>
                <select
                  value={routineCategory}
                  onChange={(e) => setRoutineCategory(e.target.value as RoutineCategory)}
                  className="w-full px-2 py-2 doodle-border-sm bg-white"
                >
                  {ROUTINE_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.icon} {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeRoutineModal}
                  className="flex-1 py-2.5 bg-gray-100 doodle-border-sm font-bold doodle-btn"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={routineDays.length === 0}
                  className="flex-1 py-2.5 bg-accent doodle-border-sm font-black doodle-btn disabled:opacity-50"
                >
                  {t.save}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 🆕 App Version / Update Notes Popup */}
      {showUpdateModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1e293b] doodle-border doodle-shadow-lg max-w-md w-full p-5 space-y-4 max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center border-b-2 border-black dark:border-slate-700 pb-2 shrink-0">
              <div>
                <h3 className="font-extrabold text-lg font-['Bricolage_Grotesque'] text-gray-900 dark:text-gray-100">
                  {user.language === 'th' ? 'ข้อมูลการอัปเดต' : 'Update Notes'}
                </h3>
                <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400">
                  v{APP_VERSION}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowUpdateModal(false)}
                className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full"
              >
                <X className="w-5 h-5 text-gray-900 dark:text-gray-100" />
              </button>
            </div>

            <div className="overflow-y-auto text-xs font-medium text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
              {isLoadingUpdateNotes ? (
                <p className="text-gray-400 dark:text-gray-500">
                  {user.language === 'th' ? 'กำลังโหลด...' : 'Loading...'}
                </p>
              ) : updateNotesError ? (
                <p className="text-gray-400 dark:text-gray-500">
                  {user.language === 'th'
                    ? 'ไม่พบไฟล์ update.txt — เพิ่มไฟล์นี้ในโฟลเดอร์ public เพื่อแสดงข้อมูลตรงนี้'
                    : 'update.txt not found — add this file to your public folder to show notes here.'}
                </p>
              ) : (
                updateNotes
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowUpdateModal(false)}
              className="w-full py-2.5 bg-accent doodle-border-sm font-black doodle-btn shrink-0"
            >
              {user.language === 'th' ? 'ปิด' : 'Close'}
            </button>
          </div>
        </div>
      )}

      {/* ⚠️ Delete Account Confirmation Modal */}
      {showDeleteAccountConfirm && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1e293b] doodle-border doodle-shadow-lg max-w-sm w-full p-5 space-y-4">
            <div className="flex items-center gap-2 border-b-2 border-black dark:border-slate-700 pb-2">
              <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
              <h3 className="font-extrabold text-lg font-['Bricolage_Grotesque'] text-gray-900 dark:text-gray-100">
                {user.language === 'th' ? 'ลบบัญชีผู้ใช้?' : 'Delete account?'}
              </h3>
            </div>

            <p className="text-xs font-bold text-gray-600 dark:text-gray-300 leading-relaxed">
              {user.language === 'th'
                ? 'การลบบัญชีจะลบงาน เป้าหมาย และข้อมูลทั้งหมดของคุณอย่างถาวร ไม่สามารถกู้คืนได้ ต้องการดำเนินการต่อหรือไม่?'
                : 'Deleting your account will permanently remove all your tasks, goals, and data. This action cannot be undone. Are you sure you want to continue?'}
            </p>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteAccountConfirm(false)}
                className="flex-1 py-2.5 bg-gray-100 dark:bg-[#0f172a] text-gray-900 dark:text-gray-100 doodle-border-sm font-bold doodle-btn"
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteAccount}
                className="flex-1 py-2.5 bg-[var(--danger-solid)] text-white doodle-border-sm font-black doodle-btn"
              >
                {user.language === 'th' ? 'ลบบัญชี' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};