import React from 'react';
import { UserProfile, ActiveTab, Task } from '../../types';
import { useTranslation } from '../../utils/translations';
import { Sparkles, RefreshCw, Settings } from 'lucide-react';
import { NotificationBell } from '../notifications/NotificationBell';

interface HeaderProps {
  user: UserProfile;
  activeTab: ActiveTab;
  isSyncing: boolean;
  onOpenSettings: () => void;
  onNavigateSettings: () => void;
  tasks?: Task[];
  authUserUid?: string;
  onNavigateTab?: (tab: ActiveTab) => void;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  activeTab,
  isSyncing,
  onOpenSettings,
  onNavigateSettings,
  tasks = [],
  authUserUid,
  onNavigateTab
}) => {
  const t = useTranslation(user.language);

  const getTitle = () => {
    switch (activeTab) {
      case 'calendar':
        return t.calendar;
      case 'tasks':
        return t.tasks;
      case 'chat':
        return t.aiChatTitle;
      case 'myspace':
        return t.mySpaceTitle;
      case 'groups':
        return t.groupsTitle;
      case 'settings':
      case 'goals_flow':
        return t.settingsTitle;
      default:
        return 'Planda';
    }
  };

  const getEnergyEmoji = (energy: string) => {
    switch (energy) {
      case 'morning_owl':
        return '🌅 Morning Owl';
      case 'afternoon_lion':
        return '🦁 Afternoon Lion';
      case 'night_owl':
        return '🌙 Night Owl';
      case 'deep_night':
        return '🦉 Deep Night';
      default:
        return '⚡ Energized';
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-[var(--paper-bg)] text-[var(--text-main)] border-b-[3px] border-[var(--ink-black)] px-4 py-3 shadow-[0_3px_0px_var(--ink-black)] transition-colors duration-200">
      <div className="max-w-md mx-auto flex items-center justify-between gap-2">
        {/* Left: User Avatar & Quick Info */}
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-2 text-left group transition-transform active:scale-95"
          title="Open Settings"
        >
          <div className="relative">
            <img
              src={user.avatarUrl && user.avatarUrl.trim() !== '' 
                ? user.avatarUrl 
                : 'https://cdn.pfps.gg/pfps/5129-default-blue.png'}
              alt={user.name}
              className="w-10 h-10 rounded-full object-cover doodle-border-sm border-2 border-[var(--ink-black)] doodle-shadow-sm bg-accent"
            />
            <span className="absolute -bottom-1 -right-1 text-xs"></span>
          </div>
          <div className="hidden sm:block">
            <h2 className="text-xs font-bold leading-tight line-clamp-1">{user.name}</h2>
            <span className="text-[10px] font-semibold bg-accent text-[#1A1A1A] px-1.5 py-0.5 rounded-full border border-black inline-block mt-0.5">
              {getEnergyEmoji(user.energyType)}
            </span>
          </div>
        </button>

        {/* Center: Screen Title */}
        <h1 className="text-lg md:text-xl font-extrabold tracking-tight text-center flex-1 truncate px-2 font-['Bricolage_Grotesque']">
          {getTitle()}
        </h1>

        {/* Right: Notification Bell + Settings Shortcut */}
        <div className="flex items-center gap-1.5">
          {onNavigateTab && (
            <NotificationBell
              language={user.language}
              tasks={tasks}
              authUserUid={authUserUid}
              onNavigateTab={onNavigateTab}
            />
          )}
          <button
            onClick={onNavigateSettings}
            className="p-2 doodle-border-sm bg-white dark:bg-[var(--card-bg)] hover:bg-[var(--accent-color)] doodle-shadow-sm doodle-btn flex items-center justify-center text-xs font-bold shrink-0"
            title={t.settings}
          >
            {isSyncing ? (
              <RefreshCw className="w-4 h-4 animate-spin text-[var(--text-main)]" />
            ) : (
              <Settings className="w-4 h-4 text-[var(--text-main)]" />
            )}
          </button>

        </div>
      </div>
    </header>
  );
};
