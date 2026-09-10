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

    // ดึง fcmTokens ของผู้ใช้ทุกคน
    const userDocs = await Promise.all(uids.map((uid) => db.collection('users').doc(uid).get()));

    const tokens = [];
    userDocs.forEach((snap) => {
      const userTokens = snap.data()?.fcmTokens;
      if (Array.isArray(userTokens)) tokens.push(...userTokens);
    });

    const safeTokens = tokens || [];
    if (safeTokens.length === 0) {
      return res.status(200).json({ sent: 0, message: 'ไม่มีอุปกรณ์ไหนเปิดการแจ้งเตือนไว้' });
    }

    const message = {
      notification: { title, body: body || '' },
      data: data || {},
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