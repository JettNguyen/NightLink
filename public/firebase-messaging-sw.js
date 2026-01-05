/* eslint-env serviceworker */
/* global importScripts firebase clients */

// Firebase Cloud Messaging Service Worker
// This runs in the background and handles push notifications

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Initialize Firebase in the service worker
// Note: You'll need to replace these with your actual config values
firebase.initializeApp({
  apiKey: "AIzaSyDGA6GVcDdzfnncfd_Nozv6W2Lykt1x53U",
  authDomain: "nightlink-3d3e8.firebaseapp.com",
  projectId: "nightlink-3d3e8",
  storageBucket: "nightlink-3d3e8.firebasestorage.app",
  messagingSenderId: "308758223884",
  appId: "1:308758223884:web:773684cb5e377f1733a229"
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('Received background message:', payload);

  const notificationTitle = payload.notification?.title || 'New notification';
  const notificationOptions = {
    body: payload.notification?.body || 'You have a new notification',
    icon: payload.notification?.icon || '/favicon.svg',
    badge: '/favicon.svg',
    data: payload.data,
    tag: payload.data?.tag || 'default',
    requireInteraction: false
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event.notification);
  event.notification.close();

  // Navigate to the app when notification is clicked
  const urlToOpen = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if there's already a window/tab open
      for (const client of clientList) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      // If not, open a new window
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
