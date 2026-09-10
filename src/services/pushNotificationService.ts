// src/services/pushNotificationService.ts
//
// เรียก /api/send-notification (Vercel serverless function) เพื่อส่ง push
// ไปหาสมาชิกกลุ่มคนอื่นๆ (ไม่รวมคนที่กระทำเอง) — ใช้ content เดียวกับ NotificationBell

export async function notifyGroupMembers(params: {
  memberIds: string[];
  excludeUid: string;
  title: string;
  body: string;
  url?: string;
}) {
  const targetUids = params.memberIds.filter((uid) => uid !== params.excludeUid);
  if (targetUids.length === 0) return;

  try {
    await fetch('/api/send-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uids: targetUids,
        title: params.title,
        body: params.body,
        data: { url: params.url || '/' },
      }),
    });
  } catch (err) {
    // ไม่ต้อง throw — การส่ง push พลาดไม่ควรทำให้การสร้างงาน/ข่าว fail ไปด้วย
    console.error('notifyGroupMembers failed:', err);
  }
}
