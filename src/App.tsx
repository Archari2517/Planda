import React, { Suspense, lazy, useState, useEffect } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Header } from './components/layout/Header';
import { BottomNav } from './components/layout/BottomNav';
import { LoginView } from './components/auth/LoginView';
import { RoutineExpiryAlert } from './components/routines/RoutineExpiryAlert';
import { listenForegroundMessages } from './lib/messaging';

const CalendarView = lazy(() =>
  import('./components/calendar/CalendarView').then(m => ({ default: m.CalendarView }))
);
const TasksView = lazy(() =>
  import('./components/tasks/TasksView').then(m => ({ default: m.TasksView }))
);
const AiChatView = lazy(() =>
  import('./components/chat/AiChatView').then(m => ({ default: m.AiChatView }))
);
const MySpaceView = lazy(() =>
  import('./components/myspace/MySpaceView').then(m => ({ default: m.MySpaceView }))
);
const SettingsView = lazy(() =>
  import('./components/settings/SettingsView').then(m => ({ default: m.SettingsView }))
);
const GoalsView = lazy(() =>
  import('./components/goals/GoalsView').then(m => ({ default: m.GoalsView }))
);
const ProfileView = lazy(() =>
  import('./components/settings/ProfileView').then(m => ({ default: m.ProfileView }))
);
const GroupsView = lazy(() =>
  import('./components/groups/GroupsView').then(m => ({ default: m.GroupsView }))
);

const ViewLoadingFallback: React.FC = () => (
  <div className="flex items-center justify-center py-24">
    <div className="doodle-border doodle-shadow bg-white px-6 py-4 flex items-center gap-3">
      <div className="w-4 h-4 rounded-full bg-[var(--ink-solid)] animate-pulse" />
      <span className="font-extrabold text-sm font-['Space_Grotesk']">Loading...</span>
    </div>
  </div>
);

const MainContent: React.FC = () => {
  const {
    user,
    authUser,
    isSyncing,
    tasks,
    goals,
    routines,
    journals,
    activeTab,
    setActiveTab,
    isOnline,
    syncNow,
    updateUser,
    addTask,
    updateTask,
    toggleTask,
    deleteTask,
    rescheduleBatch,
    addGoal,
    deleteGoal,
    toggleGoalComplete,
    togglePinGoal,
    addRoutine,
    updateRoutine,
    deleteRoutine,
    toggleRoutineActive,
    ensureMonthEvents,
    renewRoutine,
    acknowledgeRoutineExpiry,
    addJournal,
    deleteJournal,
    logout,
    deleteAccount,
    upgradeGuestGoogle,
    upgradeGuestEmail
  } = useApp();

  const [isProfileOpen, setIsProfileOpen] = useState(false);

  // 🔔 ฟัง push notification ตอนแอปเปิดอยู่ (foreground) — ให้พฤติกรรมเหมือนตอนปิดแอป
  // (background push จัดการโดย public/firebase-messaging-sw.js แยกต่างหาก)
  useEffect(() => {
    listenForegroundMessages();
  }, []);

  // 🚪 ออกจากระบบจริง (Firebase signOut) — authUser จะกลายเป็น null หลังจากนี้ ทำให้
  // MainContent เด้งกลับไปแสดง <LoginView /> โดยอัตโนมัติ (ดูเงื่อนไข `if (!authUser)` ด้านล่าง)
  // และผู้ใช้จะไม่สามารถเข้าหน้าอื่นได้จนกว่าจะเข้าสู่ระบบใหม่
  const handleLogout = async () => {
    const confirmMsg = user.language === 'th'
      ? 'ยืนยันออกจากระบบ?'
      : 'Are you sure you want to log out?';
    if (window.confirm(confirmMsg)) {
      await logout();
    }
  };

  // 🗑️ ลบบัญชีผู้ใช้ทิ้งถาวร (SettingsView เป็นคนแสดง popup ยืนยันก่อนเรียกฟังก์ชันนี้แล้ว)
  // Firebase กำหนดว่าการลบบัญชีเป็น "sensitive operation" — ถ้า session login ไว้นานเกินไป
  // จะโดน error 'auth/requires-recent-login' ต้องให้ผู้ใช้ออกจากระบบแล้วเข้าใหม่ก่อนลองอีกครั้ง
  const handleDeleteAccount = async () => {
    try {
      await deleteAccount();
    } catch (err: any) {
      if (err?.code === 'auth/requires-recent-login') {
        alert(
          user.language === 'th'
            ? 'เพื่อความปลอดภัย กรุณาออกจากระบบแล้วเข้าสู่ระบบใหม่อีกครั้ง ก่อนลบบัญชี'
            : 'For security, please log out and log back in before deleting your account.'
        );
      } else {
        console.error('Delete account failed:', err);
        alert(
          user.language === 'th'
            ? 'ลบบัญชีไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'
            : 'Failed to delete account. Please try again.'
        );
      }
    }
  };

  // ⚡ Dynamic Theme Management (Dark Mode & Theme Accent Switcher)
  useEffect(() => {
    if (!user) return;

    const root = document.documentElement;

    // 1. ตรวจสอบค่า Dark Mode (รองรับ true, false)
    const isDark = user.darkMode === true;

    // สลับ Class ที่ระดับ <html> สำหรับ Tailwind dark:
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    // 2. จัดการ Theme Accent Hex Color
    const accentHexMap: Record<string, string> = {
      yellow: '#FFE66D',
      coral: '#FF9F9F',
      sky: '#9DD9D2',
      mint: '#C1E1C1',
      blue: '#A8D8FF'
    };

    const currentAccent = accentHexMap[user.themeAccent] || '#A8D8FF';
    root.style.setProperty('--accent-color', currentAccent);
  }, [user?.darkMode, user?.themeAccent]);

  if (!authUser) {
    return <LoginView />;
  }

  const pendingCount = tasks.filter(t => !t.completed).length;

  return (
    /* 👈 ถอด ${user.darkMode ? 'dark-theme' : ''} ออกเพื่อไม่ให้สไตล์ตีกัน ให้ควบคุมผ่าน class "dark" บน <html> จุดเดียว */
    <div className="min-h-screen bg-[var(--paper-bg)] text-[var(--text-main)] flex flex-col font-['Manrope'] selection:bg-accent selection:text-black transition-colors duration-200">
      {/* 🗂️ Lifecycle & Categories — Pop-up แจ้งเตือน Routine ที่หมดอายุ */}
      <RoutineExpiryAlert
        routines={routines}
        language={user.language}
        onDeleteRoutine={deleteRoutine}
        onRenewRoutine={(id) => renewRoutine(id)}
        onAcknowledge={acknowledgeRoutineExpiry}
      />

      <Header
        user={user}
        activeTab={activeTab}
        isSyncing={isSyncing}
        onOpenSettings={() => setIsProfileOpen(true)}
        onNavigateSettings={() => setActiveTab('settings')}
        tasks={tasks}
        authUserUid={authUser?.uid}
        onNavigateTab={setActiveTab}
      />

      <main className="flex-1 w-full max-w-md mx-auto relative">
        <Suspense fallback={<ViewLoadingFallback />}>
          {activeTab === 'calendar' && (
            <CalendarView
              user={user}
              tasks={tasks}
              goals={goals}
              routines={routines}
              onToggleTask={toggleTask}
              onAddTask={addTask}
              onUpdateTask={updateTask}
              onDeleteTask={deleteTask}
              onRescheduleBatch={rescheduleBatch}
              onEnsureMonthEvents={ensureMonthEvents}
            />
          )}

          {activeTab === 'tasks' && (
            <TasksView
              user={user}
              tasks={tasks}
              goals={goals}
              onToggleTask={toggleTask}
              onAddTask={addTask}
              onUpdateTask={updateTask}
              onDeleteTask={deleteTask}
              onNavigateToGoals={() => setActiveTab('goals_flow')}
            />
          )}

          {activeTab === 'chat' && (
            <AiChatView
              user={user}
              goals={goals}
              tasks={tasks}
              onAddTask={addTask}
              onUpdateTask={updateTask}
              onDeleteTask={deleteTask}
              onNavigateTab={setActiveTab}
            />
          )}

          {activeTab === 'myspace' && (
            <MySpaceView
              user={user}
              tasks={tasks}
              goals={goals}
              journals={journals}
              onAddJournal={addJournal}
              onDeleteJournal={deleteJournal}
              onAddTask={addTask}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              user={user}
              goals={goals}
              routines={routines}
              authUser={authUser}
              onUpgradeGoogle={upgradeGuestGoogle}
              onUpgradeEmail={upgradeGuestEmail}
              onUpdateUser={updateUser}
              onNavigateToGoals={() => setActiveTab('goals_flow')}
              onAddRoutine={addRoutine}
              onUpdateRoutine={updateRoutine}
              onDeleteRoutine={deleteRoutine}
              onToggleRoutineActive={toggleRoutineActive}
              onRenewRoutine={(id) => renewRoutine(id)}
              onLogout={handleLogout}
              onDeleteAccount={handleDeleteAccount}
            />
          )}

          {activeTab === 'groups' && (
            <GroupsView user={user} />
          )}

          {activeTab === 'goals_flow' && (
            <GoalsView
              user={user}
              goals={goals}
              tasks={tasks}
              onAddGoal={addGoal}
              onDeleteGoal={deleteGoal}
              onToggleGoalComplete={toggleGoalComplete}
              onTogglePinGoal={togglePinGoal}
              onBack={() => setActiveTab('tasks')}
            />
          )}

          {isProfileOpen && (
            <div className="fixed inset-0 z-50 bg-[var(--paper-bg)] overflow-y-auto">
              <ProfileView
                user={user}
                goals={goals}
                authUser={authUser}
                onUpgradeGoogle={upgradeGuestGoogle}
                onUpgradeEmail={upgradeGuestEmail}
                onUpdateProfile={(updatedData) => {
                  updateUser(updatedData);
                  setIsProfileOpen(false);
                }}
                onBack={() => setIsProfileOpen(false)}
                onLogout={handleLogout}
              />
            </div>
          )}
        </Suspense>
      </main>

      <BottomNav
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        language={user.language}
        pendingTasksCount={pendingCount}
      />
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <MainContent />
    </AppProvider>
  );
}