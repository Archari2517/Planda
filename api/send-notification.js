import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

// Initialize Firebase App
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
  });
}

const db = getFirestore();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { uids, title, body, data } = req.body || {};

    if (!Array.isArray(uids) || uids.length === 0 || !title) {
      return res.status(400).json({ error: 'ต้องส่ง uids (array) และ title มาด้วย' });
    }

    // กัน uid ซ้ำที่ฝั่ง client อาจส่งมาซ้ำ
    const uniqueUids = [...new Set(uids)];

    // ดึง fcmTokens ของผู้ใช้ทุกคน
    const userDocs = await Promise.all(uniqueUids.map((uid) => db.collection('users').doc(uid).get()));

    const tokens = [];
    userDocs.forEach((snap) => {
      const userTokens = snap.data()?.fcmTokens;
      if (Array.isArray(userTokens)) tokens.push(...userTokens);
    });

    // กัน token ซ้ำ (เครื่องเดียวกันมี token ซ้ำในเอกสารเดียวกัน หรือ token เดียวกันไปอยู่คนละ uid)
    // เป็นสาเหตุหลักที่ทำให้อุปกรณ์เดียวได้รับแจ้งเตือน 2 อัน
    const safeTokens = [...new Set(tokens)];
    if (safeTokens.length === 0) {
      return res.status(200).json({ sent: 0, message: 'ไม่มีอุปกรณ์ไหนเปิดการแจ้งเตือนไว้' });
    }

    // ⚠️ จงใจไม่ใส่ field "notification" — ถ้าใส่ FCM/เบราว์เซอร์จะ auto-แสดง
    // notification ให้เองทันที ซ้อนกับที่ client (src/lib/messaging.ts +
    // public/firebase-messaging-sw.js) สร้างเอง ทำให้ผู้ใช้เห็นแจ้งเตือน 2 อัน
    // ส่งเป็น data-only message แล้วให้ client เป็นคนโชว์ notification เองทั้งหมด
    // (data payload ทุก field ต้องเป็น string เท่านั้น ตามข้อกำหนดของ FCM)
    const rawData = { ...(data || {}), title, body: body || '' };
    const stringData = Object.fromEntries(
      Object.entries(rawData).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)])
    );

    const message = {
      data: stringData,
      tokens: safeTokens,
    };

    // ส่งข้อความผ่าน messaging instance
    const response = await getMessaging().sendEachForMulticast(message);

    // ลบ token ที่ใช้งานไม่ได้ออก
    const deadTokens = [];
    response.responses.forEach((r, i) => {
      if (!r.success && ['messaging/invalid-registration-token', 'messaging/registration-token-not-registered'].includes(r.error?.code)) {
        deadTokens.push(safeTokens[i]);
      }
    });

    if (deadTokens.length > 0) {
      await Promise.all(
        userDocs.map((snap) =>
          snap.ref.update({ fcmTokens: FieldValue.arrayRemove(...deadTokens) }).catch(() => {})
        )
      );
    }

    return res.status(200).json({ sent: response.successCount, failed: response.failureCount });
  } catch (err) {
    console.error('send-notification error:', err);
    return res.status(500).json({ error: 'ส่งการแจ้งเตือนไม่สำเร็จ', details: err.message });
  }
}