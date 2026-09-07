// src/hooks/useNotificationReadState.ts
//
// 🔕 เก็บสถานะ "อ่านแล้ว" ของการแจ้งเตือนแต่ละรายการ แยกตาม uid ของผู้ใช้ ไว้ใน
// localStorage ของเครื่อง (ไม่ผูกกับ Firestore เพราะเป็นแค่สถานะ UI ส่วนตัวของผู้ใช้
// บนอุปกรณ์นี้ ไม่จำเป็นต้อง sync ข้ามอุปกรณ์)
//
// ใช้ id ที่ไม่ซ้ำกันข้ามประเภทการแจ้งเตือน เช่น "task:<docId>", "news:<docId>",
// "due:<taskId>" เพื่อรองรับการแจ้งเตือนหลายประเภทด้วยชุดสถานะเดียวกัน
import { useCallback, useEffect, useState } from 'react';

const STORAGE_PREFIX = 'planda_read_notifications_';

function loadReadIds(uid: string): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + uid);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function persistReadIds(uid: string, ids: Set<string>) {
  try {
    localStorage.setItem(STORAGE_PREFIX + uid, JSON.stringify(Array.from(ids)));
  } catch {
    // localStorage อาจถูกบล็อก (เช่น โหมดส่วนตัว/พื้นที่เต็ม) — ข้ามไปเงียบๆ ไม่กระทบการทำงานหลัก
  }
}

export function useNotificationReadState(uid: string | undefined) {
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  // โหลดสถานะที่บันทึกไว้ใหม่ทุกครั้งที่ uid เปลี่ยน (เช่น สลับบัญชี)
  useEffect(() => {
    setReadIds(uid ? loadReadIds(uid) : new Set());
  }, [uid]);

  // ทำเครื่องหมาย "อ่านแล้ว" ให้ id ที่ระบุทั้งหมด แล้วบันทึกลง localStorage ทันที
  const markRead = useCallback(
    (ids: string[]) => {
      if (!uid || ids.length === 0) return;
      setReadIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.add(id));
        persistReadIds(uid, next);
        return next;
      });
    },
    [uid]
  );

  return { readIds, markRead };
}
