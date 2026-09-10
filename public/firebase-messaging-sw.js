// public/firebase-messaging-sw.js
//
// Service Worker สำหรับรับ Push Notification จาก Firebase Cloud Messaging (FCM)
// ทำงานได้แม้ปิดแท็บ/แอปไปแล้ว (background push)
//
// หมายเหตุ: ไฟล์นี้อยู่ใน public/ ซึ่ง Vite ไม่ได้ process ให้ (ไม่มี import.meta.env)
// ค่า firebaseConfig ด้านล่างเป็นค่า "public" เดียวกับที่อยู่ใน .env (VITE_FIREBASE_*)
// ไม่ใช่ความลับ ปลอดภัยที่จะ hardcode ไว้ตรงนี้
//
// วิธีใช้: แทนที่ค่าด้านล่างด้วยค่าจริงจาก Firebase Console ของคุณ
// (Project settings > General > Your apps > SDK setup and configuration)

importScripts('https://www.gstatic.com/firebasejs/10.13.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyAsn_J00yiaB9hXR1h7PGHBB0XuMH23cpo',
  authDomain: 'planda-85213.firebaseapp.com',
  projectId: 'planda-85213',
  storageBucket: 'planda-85213.firebasestorage.app',
  messagingSenderId: '32247155989',
  appId: '1:32247155989:web:a34cacc8b123247962ed1c',
});

const messaging = firebase.messaging();

// เมื่อมี push เข้ามาตอนแอปปิดอยู่/อยู่เบื้องหลัง — โชว์เป็น OS notification
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || payload.data?.title || 'แจ้งเตือนใหม่';
  const body = payload.notification?.body || payload.data?.body || '';

  self.registration.showNotification(title, {
    body,
    icon: '/app-icon.jpg', // เปลี่ยนเป็น path ไอคอนจริงของแอปคุณใน public/
    badge: '/app-icon.jpg',
    data: payload.data, // ใช้ตอนคลิก notification เพื่อ deep-link กลับเข้าแอป
  });
});

// คลิก notification แล้วเด้งกลับเข้าแอป (โฟกัสแท็บที่เปิดอยู่ถ้ามี ไม่งั้นเปิดใหม่)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
