// public/sw.js
// Minimal service worker satisfying PWA installability criteria & caching core app shell.
// Handle FCM Push Notifications with robust fallback support for both 'notification' and 'data-only' payloads.

const CACHE_NAME = 'planda-shell-v3'; // Bumped version to force cache refresh
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-badge.png', // เพิ่มไฟล์ Badge ขาว-ดำ
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL).catch(() => {
      // Non-fatal fallback for assets not ready at install time
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
// Handles both 'notification' payloads (from Firebase Console/Backend) and 'data-only' payloads
self.addEventListener('push', (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch (err) {
      payload = { data: { body: event.data.text() } };
    }
  }

  // อ่านค่าจาก notification payload ก่อน ถ้าไม่มีค่อยสลับไปอ่านจาก data payload
  const notificationField = payload.notification || {};
  const dataField = payload.data || (payload.notification ? {} : payload);

  const title = notificationField.title || dataField.title || 'แจ้งเตือนใหม่';
  const body = notificationField.body || dataField.body || '';

  const options = {
    body: body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-badge.png', // 🔥 เปลี่ยนมาใช้ไอคอนขาว-ดำ แก้ปัญหากรอบสี่เหลี่ยมขาว
    data: dataField, // เก็บ payloadData ไว้ใช้ตอนกด notification (เช่น targetUrl)
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

  // Only handle GET requests on our own origin.
  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  // Navigations: network-first
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

  // Static assets: cache-first
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