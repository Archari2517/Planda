// src/hooks/useGroupNotifications.ts
//
// 🔔 รวมศูนย์ "การแจ้งเตือนจากกลุ่ม" สำหรับผู้ใช้คนปัจจุบัน โดยฟังข้อมูลแบบเรียลไทม์
// จากทุกกลุ่มที่ผู้ใช้เป็นสมาชิกอยู่ (ไม่ใช่แค่กลุ่มที่เปิดดูอยู่แบบใน GroupsView)
//
// นิยามของ "ใหม่" (ก่อนกรองสถานะอ่านแล้ว):
//   - งานกลุ่ม (GroupTask)  ถือว่า "ใหม่" ถ้าเรายังไม่เคยกดตอบรับ/ปฏิเสธ (responses[uid] ยังไม่มีค่า)
//   - ข่าวกลุ่ม (GroupNews) ถือว่า "ใหม่" ถ้าเรายังไม่เคยกด "รับทราบ" (uid ยังไม่อยู่ใน acknowledgedBy)
// และไม่นับงาน/ข่าวที่เราเป็นคนสร้างเอง (creatorId === เรา)
//
// จากนั้นกรองด้วย `readIds` ที่รับเข้ามา (จาก useNotificationReadState) อีกชั้น — ถ้าผู้ใช้เคย
// กดเข้าไปดูการแจ้งเตือนนั้นแล้ว (แม้จะยังไม่ได้ตอบรับ/รับทราบในระบบจริงก็ตาม) จะไม่โผล่ขึ้นมาอีก
import { useEffect, useState } from 'react';
import { db } from '../lib/firebase';
import { collection, onSnapshot, query, where } from 'firebase/firestore';

interface RawGroupEntry {
  groupName: string;
  items: { id: string; title: string }[]; // id เป็น key รูปแบบ "task:<docId>" หรือ "news:<docId>"
}

export interface GroupNotificationGroup {
  groupId: string;
  groupName: string;
  count: number;
  // ชื่องาน/ข่าวล่าสุดไว้โชว์เป็นตัวอย่างในแผงแจ้งเตือน
  previewTitles: string[];
  // key ทั้งหมดของรายการในการ์ดนี้ — ใช้ส่งเข้า markRead() เมื่อผู้ใช้กดเปิดดู
  itemKeys: string[];
}

interface UseGroupNotificationsResult {
  newTasksByGroup: GroupNotificationGroup[];
  newNewsByGroup: GroupNotificationGroup[];
  totalNewTasks: number;
  totalNewNews: number;
}

const EMPTY_RESULT: UseGroupNotificationsResult = {
  newTasksByGroup: [],
  newNewsByGroup: [],
  totalNewTasks: 0,
  totalNewNews: 0,
};

function buildFilteredGroups(
  rawMap: Map<string, RawGroupEntry>,
  readIds: Set<string>
): GroupNotificationGroup[] {
  const list: GroupNotificationGroup[] = [];
  rawMap.forEach((entry, groupId) => {
    const unread = entry.items.filter((item) => !readIds.has(item.id));
    if (unread.length === 0) return;
    list.push({
      groupId,
      groupName: entry.groupName,
      count: unread.length,
      previewTitles: unread.slice(0, 3).map((i) => i.title),
      itemKeys: unread.map((i) => i.id),
    });
  });
  return list;
}

/**
 * @param uid uid ของผู้ใช้ปัจจุบัน — ถ้าไม่มี (ยังไม่ login) จะไม่ subscribe อะไรเลย
 * @param readIds ชุด id ของการแจ้งเตือนที่ผู้ใช้กดอ่านไปแล้ว (จาก useNotificationReadState)
 */
export function useGroupNotifications(
  uid: string | undefined,
  readIds: Set<string>
): UseGroupNotificationsResult {
  const [rawTasksByGroup, setRawTasksByGroup] = useState<Map<string, RawGroupEntry>>(new Map());
  const [rawNewsByGroup, setRawNewsByGroup] = useState<Map<string, RawGroupEntry>>(new Map());

  useEffect(() => {
    if (!uid) {
      setRawTasksByGroup(new Map());
      setRawNewsByGroup(new Map());
      return;
    }

    // เก็บ unsubscribe ของ listener ย่อยรายกลุ่ม (งาน/ข่าว) เพื่อเปิด-ปิดตามกลุ่มที่เข้า-ออก
    const taskUnsubs = new Map<string, () => void>();
    const newsUnsubs = new Map<string, () => void>();
    const groupNames = new Map<string, string>();
    const taskItemsMap = new Map<string, { id: string; title: string }[]>();
    const newsItemsMap = new Map<string, { id: string; title: string }[]>();

    const pushTasks = () => {
      const next = new Map<string, RawGroupEntry>();
      taskItemsMap.forEach((items, groupId) => {
        if (items.length === 0) return;
        next.set(groupId, { groupName: groupNames.get(groupId) || '', items });
      });
      setRawTasksByGroup(next);
    };

    const pushNews = () => {
      const next = new Map<string, RawGroupEntry>();
      newsItemsMap.forEach((items, groupId) => {
        if (items.length === 0) return;
        next.set(groupId, { groupName: groupNames.get(groupId) || '', items });
      });
      setRawNewsByGroup(next);
    };

    const groupsQuery = query(collection(db, 'groups'), where('memberIds', 'array-contains', uid));

    const unsubGroups = onSnapshot(groupsQuery, (groupsSnap) => {
      const currentGroupIds = new Set<string>();

      groupsSnap.docs.forEach((groupDoc) => {
        const groupId = groupDoc.id;
        const data = groupDoc.data() as any;
        groupNames.set(groupId, data?.name || '');
        currentGroupIds.add(groupId);

        // งานกลุ่ม (GroupTask) — สร้าง listener ครั้งเดียวต่อกลุ่ม
        if (!taskUnsubs.has(groupId)) {
          const tasksQuery = query(collection(db, 'groupTasks'), where('groupId', '==', groupId));
          const unsub = onSnapshot(tasksQuery, (tasksSnap) => {
            const items: { id: string; title: string }[] = [];
            tasksSnap.docs.forEach((taskDoc) => {
              const task = taskDoc.data() as any;
              const isMine = task.creatorId === uid;
              const alreadyResponded = !!task.responses?.[uid];
              if (!isMine && !alreadyResponded) {
                items.push({ id: `task:${taskDoc.id}`, title: task.title || '' });
              }
            });
            taskItemsMap.set(groupId, items);
            pushTasks();
          });
          taskUnsubs.set(groupId, unsub);
        }

        // ข่าวกลุ่ม (GroupNews) — สร้าง listener ครั้งเดียวต่อกลุ่ม
        if (!newsUnsubs.has(groupId)) {
          const newsQuery = query(collection(db, 'groupNews'), where('groupId', '==', groupId));
          const unsub = onSnapshot(newsQuery, (newsSnap) => {
            const items: { id: string; title: string }[] = [];
            newsSnap.docs.forEach((newsDoc) => {
              const item = newsDoc.data() as any;
              const isMine = item.creatorId === uid;
              const alreadyAcknowledged = (item.acknowledgedBy || []).includes(uid);
              if (!isMine && !alreadyAcknowledged) {
                items.push({ id: `news:${newsDoc.id}`, title: item.title || '' });
              }
            });
            newsItemsMap.set(groupId, items);
            pushNews();
          });
          newsUnsubs.set(groupId, unsub);
        }
      });

      // เลิกฟังกลุ่มที่เราไม่ได้เป็นสมาชิกแล้ว (ออกจากกลุ่ม/ถูกลบ)
      taskUnsubs.forEach((unsub, groupId) => {
        if (!currentGroupIds.has(groupId)) {
          unsub();
          taskUnsubs.delete(groupId);
          taskItemsMap.delete(groupId);
        }
      });
      newsUnsubs.forEach((unsub, groupId) => {
        if (!currentGroupIds.has(groupId)) {
          unsub();
          newsUnsubs.delete(groupId);
          newsItemsMap.delete(groupId);
        }
      });

      pushTasks();
      pushNews();
    });

    return () => {
      unsubGroups();
      taskUnsubs.forEach((unsub) => unsub());
      newsUnsubs.forEach((unsub) => unsub());
    };
  }, [uid]);

  if (!uid) return EMPTY_RESULT;

  const newTasksByGroup = buildFilteredGroups(rawTasksByGroup, readIds);
  const newNewsByGroup = buildFilteredGroups(rawNewsByGroup, readIds);

  return {
    newTasksByGroup,
    newNewsByGroup,
    totalNewTasks: newTasksByGroup.reduce((sum, g) => sum + g.count, 0),
    totalNewNews: newNewsByGroup.reduce((sum, g) => sum + g.count, 0),
  };
}
