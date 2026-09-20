// public/sw.js
// Minimal service worker. Its main job is to satisfy PWA installability
// criteria (Chrome requires a registered SW with a fetch handler) and give a
// basic offline fallback for the app shell. It deliberately does NOT try to
// cache or intercept Firebase/Gemini/Supabase requests — those are
// cross-origin, so they're left alone automatically by the same-origin check
// below. Bump CACHE_NAME whenever you want to force clients to drop old caches.
//
// ⚠️ ไฟล์นี้ยังทำหน้าที่รับ push notification ด้วย (รวมมาจาก firebase-messaging-sw.js
// เดิม) เพราะ 1 origin ควบคุม scope '/' ได้ด้วย service worker แค่ตัวเดียวเท่านั้น
// ห้ามแยกไฟล์ firebase-messaging-sw.js ออกไป register เองอีก ไม่งั้นจะกลับไปแย่ง
// scope กันเหมือนเดิม (นี่คือสาเหตุที่แจ้งเตือน push เคยใช้ได้แล้วอยู่ๆ ก็หยุดทำงาน
// เองทั้งที่ไม่มีใครแก้โค้ดส่วนนั้นเลย — sw.js ตัวนี้ถูก register ซ้ำทุกครั้งที่โหลด
// หน้าเว็บใน main.tsx จึงชนะแย่งควบคุมจาก firebase-messaging-sw.js ไปเงียบๆ)

const CACHE_NAME = 'planda-shell-v1';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL).catch(() => {
      // Non-fatal: some assets (e.g. hashed bundle files) don't exist yet at
      // install time. The app shell still installs; runtime caching below
      // fills in the rest as they're fetched.
    }))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

// --- Push notification handling ---
// backend (api/send-notification.js) ส่งเป็น "data-only" message ผ่าน FCM
// (ไม่มี field "notification") โดยตั้งใจ เพื่อไม่ให้เบราว์เซอร์ auto-แสดง
// notification ซ้อนกับที่เราโชว์เอง เบราว์เซอร์จะ decrypt payload ให้เองแล้วยิง
// 'push' event มาตรงๆ ไม่ต้องพึ่ง Firebase SDK ในไฟล์นี้เลย
self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (err) {
    payload = {};
  }

  // FCM ส่ง data-only message มาเป็นรูปแบบ { data: { title, body, ... } }
  const data = payload.data || payload;
  const title = data.title || 'แจ้งเตือนใหม่';
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data, // เก็บไว้ใช้ตอนกด notification (เช่น url ที่จะเปิด)
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// กดที่ notification แล้วเปิด/โฟกัสหน้าแอป (ใช้ data.url ถ้ามีส่งมาจาก backend)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests on our own origin. Everything else (Firestore
  // watch streams, Gemini API calls, Supabase, cross-origin fonts, etc.)
  // passes straight through untouched.
  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  // Navigations: network-first so users always get the latest app shell when
  // online, falling back to the cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Static assets: cache-first, then fall back to network and populate the
  // cache for next time.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
