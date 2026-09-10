// api/send-notification.js
//
// Vercel Serverless Function — ตัวเดียวที่มีสิทธิ์ "ส่ง" push แทนคนอื่นได้
// (client ฝั่งอื่นส่ง push ตรงๆ ไม่ได้ ด้วยเหตุผลด้าน security ต้องผ่าน server ที่ถือ Admin credential)
//
// เรียกใช้จาก client หลังสร้าง groupTask/groupNews สำเร็จ เช่น:
//   fetch('/api/send-notification', {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({ uids: [...memberUids], title, body, data: { url: '/groups' } })
//   })
//
// ต้องตั้งค่า Environment Variables ใน Vercel Project Settings ก่อน (ดู NOTIFICATION_SETUP.md):
//   FIREBASE_PROJECT_ID
//   FIREBASE_CLIENT_EMAIL
//   FIREBASE_PRIVATE_KEY

import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Vercel เก็บ newline ใน env var เป็น "\\n" ต้องแปลงกลับเป็น newline จริง
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { uids, title, body, data } = req.body;

    if (!Array.isArray(uids) || uids.length === 0 || !title) {
      return res.status(400).json({ error: 'ต้องส่ง uids (array) และ title มาด้วย' });
    }

    // ดึง fcmTokens ของผู้ใช้ทุกคนที่ต้องการแจ้งเตือน
    const userDocs = await Promise.all(uids.map((uid) => db.collection('users').doc(uid).get()));

    const tokens = [];
    userDocs.forEach((snap) => {
      const userTokens = snap.data()?.fcmTokens;
      if (Array.isArray(userTokens)) tokens.push(...userTokens);
    });

    if (tokens.length === 0) {
      return res.status(200).json({ sent: 0, message: 'ไม่มีอุปกรณ์ไหนเปิดการแจ้งเตือนไว้' });
    }

    const message = {
      notification: { title, body: body || '' },
      data: data || {},
      tokens,
    };

    const response = await admin.messaging().sendEachForMulticast(message);

    // เก็บกวาด token ที่ตายแล้ว (ผู้ใช้ถอนการอนุญาต/ลบแอป) ออกจาก Firestore
    const deadTokens = [];
    response.responses.forEach((r, i) => {
      if (!r.success && ['messaging/invalid-registration-token', 'messaging/registration-token-not-registered'].includes(r.error?.code)) {
        deadTokens.push(tokens[i]);
      }
    });
    if (deadTokens.length > 0) {
      await Promise.all(
        userDocs.map((snap) =>
          snap.ref.update({ fcmTokens: admin.firestore.FieldValue.arrayRemove(...deadTokens) }).catch(() => {})
        )
      );
    }

    return res.status(200).json({ sent: response.successCount, failed: response.failureCount });
  } catch (err) {
    console.error('send-notification error:', err);
    return res.status(500).json({ error: 'ส่งการแจ้งเตือนไม่สำเร็จ' });
  }
}
