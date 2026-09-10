// src/lib/messaging.ts
//
// จัดการฝั่ง client ของ Firebase Cloud Messaging (FCM):
//   1. ขอ permission จากผู้ใช้
//   2. ดึง FCM token ของอุปกรณ์/เบราว์เซอร์นี้ แล้วบันทึกลง Firestore (users/{uid})
//   3. ฟัง push ตอนแอปเปิดอยู่ (foreground) เพื่อโชว์เป็น browser notification เหมือนกัน
//
// ใช้คู่กับ public/firebase-messaging-sw.js (รับ push ตอนแอปปิด/อยู่เบื้องหลัง)

import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import { doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { app, db } from './firebase';

// TODO: สร้าง Web Push certificate (VAPID key) ได้ที่
// Firebase Console > Project settings > Cloud Messaging > Web configuration > Generate key pair
const VAPID_KEY = 'BPV3qnHWZWoBntf0y3W3FEu09IOfRdVebHJz1U8kPjc2nOYTjgqhpMG5WdXv2IXOAs8BUm1dgFGypxrdkas897E';

/**
 * ขอ permission + ดึง FCM token แล้วบันทึกลง users/{uid}.fcmTokens (array)
 * เก็บเป็น array เพราะผู้ใช้คนเดียวอาจล็อกอินหลายอุปกรณ์/เบราว์เซอร์
 * เรียกฟังก์ชันนี้หลัง login สำเร็จ หรือตอนผู้ใช้กดปุ่ม "เปิดการแจ้งเตือน" ใน Settings
 */
export async function enablePushNotifications(uid: string): Promise<'granted' | 'denied' | 'unsupported'> {
  const supported = await isSupported().catch(() => false);
  if (!supported || !('serviceWorker' in navigator)) return 'unsupported';

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';

  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  const messaging = getMessaging(app);

  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: registration,
  }).catch((err) => {
    console.error('ดึง FCM token ไม่สำเร็จ:', err);
    return null;
  });

  if (!token) return 'denied';

  await updateDoc(doc(db, 'users', uid), {
    fcmTokens: arrayUnion(token),
  }).catch(async () => {
    // ถ้า doc ยังไม่มี field นี้เลย ให้ merge สร้างใหม่
    const { setDoc } = await import('firebase/firestore');
    await setDoc(doc(db, 'users', uid), { fcmTokens: [token] }, { merge: true });
  });

  return 'granted';
}

/** เอา token ของอุปกรณ์นี้ออกจาก Firestore ตอนผู้ใช้ปิดการแจ้งเตือน หรือ logout */
export async function disablePushNotifications(uid: string) {
  const supported = await isSupported().catch(() => false);
  if (!supported) return;

  const messaging = getMessaging(app);
  const registration = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
  if (!registration) return;

  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: registration,
  }).catch(() => null);

  if (token) {
    await updateDoc(doc(db, 'users', uid), { fcmTokens: arrayRemove(token) }).catch(() => {});
  }
}

/**
 * ฟัง push ตอนแอปเปิดอยู่ (foreground) — ปกติ FCM จะไม่โชว์ system notification ให้เองตอน foreground
 * เลยต้องดักแล้วสร้าง Notification เองให้พฤติกรรมเหมือนกับตอน background
 * เรียกครั้งเดียวตอนแอป mount (เช่นใน App.tsx หรือ AppContext)
 */
export function listenForegroundMessages() {
  isSupported().then((supported) => {
    if (!supported) return;
    const messaging = getMessaging(app);
    onMessage(messaging, (payload) => {
      const title = payload.notification?.title || payload.data?.title || 'แจ้งเตือนใหม่';
      const body = payload.notification?.body || payload.data?.body || '';
      if (Notification.permission === 'granted') {
        new Notification(title, { body, icon: '/app-icon.jpg' });
      }
    });
  });
}
