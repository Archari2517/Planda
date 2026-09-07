// src/components/notifications/NotificationBell.tsx
//
// 🔔 ไอคอนกระดิ่งแจ้งเตือนบน Header — รวม 3 ประเภทการแจ้งเตือนไว้ในที่เดียว:
//   1. งานใหม่จากกลุ่ม (ยังไม่ได้กดตอบรับ/ปฏิเสธ)
//   2. ข่าวใหม่จากกลุ่ม (ยังไม่ได้กด "รับทราบ")
//   3. งานที่มีกำหนดส่ง (Deadline Task) ที่ครบกำหนดส่ง "วันนี้" และยังไม่เสร็จ
//
// 🔕 กด "เข้าไปดู" การ์ดแจ้งเตือนอันไหน = ถือว่าอ่านแล้ว ถูกจดจำไว้ (localStorage ต่อผู้ใช้)
// เปิดแผงใหม่จะไม่เห็นการ์ดนั้นอีก จนกว่าจะมีรายการใหม่จริงๆ เข้ามาแทน (คนละ id กัน)
import React, { useEffect, useRef, useState } from 'react';
import { Bell, Megaphone, ClipboardList, Timer, X } from 'lucide-react';
import type { ActiveTab, Language, Task } from '../../types';
import { daysUntil, getLocalTodayStr } from '../../utils/date';
import { useGroupNotifications, GroupNotificationGroup } from '../../hooks/useGroupNotifications';
import { useNotificationReadState } from '../../hooks/useNotificationReadState';

interface NotificationBellProps {
  language: Language;
  tasks: Task[];
  authUserUid?: string;
  onNavigateTab: (tab: ActiveTab) => void;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({
  language,
  tasks,
  authUserUid,
  onNavigateTab,
}) => {
  const isTh = language === 'th';
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const { readIds, markRead } = useNotificationReadState(authUserUid);
  const { newTasksByGroup, newNewsByGroup } = useGroupNotifications(authUserUid, readIds);

  // ⏰ งานที่มีกำหนดส่ง (Deadline Task) ที่ครบกำหนด "วันนี้" และยังไม่เสร็จ และยังไม่ถูกกดอ่าน
  const dueTodayTasks = tasks.filter(
    (t) =>
      t.eisenhowerQuadrant === 'deadline' &&
      !t.completed &&
      daysUntil(t.dueDate, getLocalTodayStr()) === 0 &&
      !readIds.has(`due:${t.id}`)
  );

  const totalNotificationCards =
    (dueTodayTasks.length > 0 ? 1 : 0) + newTasksByGroup.length + newNewsByGroup.length;

  // ปิดแผงแจ้งเตือนเมื่อคลิกข้างนอก
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // กดเข้าไปดูการ์ดแจ้งเตือน = ทำเครื่องหมายอ่านแล้ว + พาไปหน้าที่เกี่ยวข้อง
  const openNotification = (ids: string[], tab: ActiveTab) => {
    markRead(ids);
    setIsOpen(false);
    onNavigateTab(tab);
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative p-2 doodle-border-sm bg-white dark:bg-[var(--card-bg)] hover:bg-[var(--accent-color)] doodle-shadow-sm doodle-btn flex items-center justify-center shrink-0"
        title={isTh ? 'การแจ้งเตือน' : 'Notifications'}
      >
        <Bell className="w-4 h-4 text-[var(--text-main)]" />
        {totalNotificationCards > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 bg-[#FF4D4D] border border-black text-white text-[9px] font-bold rounded-full flex items-center justify-center">
            {totalNotificationCards > 9 ? '9+' : totalNotificationCards}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-72 max-w-[85vw] bg-[var(--paper-bg)] doodle-border doodle-shadow-lg p-3 space-y-2.5 animate-in fade-in zoom-in-95 duration-150 max-h-[70vh] overflow-y-auto">
          <div className="flex items-center justify-between border-b-2 border-black/10 pb-2">
            <h3 className="font-extrabold text-sm font-['Bricolage_Grotesque'] text-[var(--text-main)]">
              {isTh ? 'การแจ้งเตือน' : 'Notifications'}
            </h3>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 hover:bg-gray-200 rounded-full shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {totalNotificationCards === 0 && (
            <p className="text-xs font-bold text-gray-400 py-6 text-center">
              {isTh ? 'ยังไม่มีการแจ้งเตือนใหม่ 🎉' : 'No new notifications 🎉'}
            </p>
          )}

          {/* 1) งานที่มีกำหนดส่งวันนี้ */}
          {dueTodayTasks.length > 0 && (
            <button
              onClick={() =>
                openNotification(
                  dueTodayTasks.map((t) => `due:${t.id}`),
                  'tasks'
                )
              }
              className="w-full text-left p-2.5 bg-[#FFE66D] doodle-border-sm doodle-btn flex items-start gap-2.5"
            >
              <div className="w-8 h-8 rounded-lg bg-white doodle-border-sm flex items-center justify-center shrink-0">
                <Timer className="w-4 h-4 text-[#1A1A1A]" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-extrabold text-[#1A1A1A] leading-snug">
                  {isTh
                    ? `มีงาน ${dueTodayTasks.length} งานใกล้ถึงกำหนดส่ง (ครบกำหนดวันนี้)`
                    : `${dueTodayTasks.length} task${dueTodayTasks.length > 1 ? 's' : ''} due today`}
                </p>
                <p className="text-[10px] font-semibold text-[#1A1A1A]/70 line-clamp-1 mt-0.5">
                  {dueTodayTasks.map((t) => t.title).join(' • ')}
                </p>
              </div>
            </button>
          )}

          {/* 2) งานใหม่จากกลุ่ม */}
          {newTasksByGroup.map((g: GroupNotificationGroup) => (
            <button
              key={`task_${g.groupId}`}
              onClick={() => openNotification(g.itemKeys, 'groups')}
              className="w-full text-left p-2.5 bg-white doodle-border-sm doodle-btn flex items-start gap-2.5"
            >
              <div className="w-8 h-8 rounded-lg bg-accent doodle-border-sm flex items-center justify-center shrink-0">
                <ClipboardList className="w-4 h-4 text-[#1A1A1A]" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-extrabold text-[var(--text-main)] leading-snug">
                  {isTh
                    ? `มีงานใหม่จากกลุ่ม ${g.groupName} (${g.count} งาน)`
                    : `${g.count} new task${g.count > 1 ? 's' : ''} in ${g.groupName}`}
                </p>
                <p className="text-[10px] font-semibold text-gray-500 line-clamp-1 mt-0.5">
                  {g.previewTitles.join(' • ')}
                </p>
              </div>
            </button>
          ))}

          {/* 3) ข่าวใหม่จากกลุ่ม */}
          {newNewsByGroup.map((g: GroupNotificationGroup) => (
            <button
              key={`news_${g.groupId}`}
              onClick={() => openNotification(g.itemKeys, 'groups')}
              className="w-full text-left p-2.5 bg-white doodle-border-sm doodle-btn flex items-start gap-2.5"
            >
              <div className="w-8 h-8 rounded-lg bg-[#9DD9D2] doodle-border-sm flex items-center justify-center shrink-0">
                <Megaphone className="w-4 h-4 text-[#1A1A1A]" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-extrabold text-[var(--text-main)] leading-snug">
                  {isTh
                    ? `มีข่าวใหม่จากกลุ่ม ${g.groupName} (${g.count} เรื่อง)`
                    : `${g.count} new update${g.count > 1 ? 's' : ''} in ${g.groupName}`}
                </p>
                <p className="text-[10px] font-semibold text-gray-500 line-clamp-1 mt-0.5">
                  {g.previewTitles.join(' • ')}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
