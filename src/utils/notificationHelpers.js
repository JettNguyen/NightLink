import { deleteToken, getToken, onMessage } from 'firebase/messaging';
import { messaging } from '../firebase';
import { arrayUnion, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Request notification permission and get FCM token
 * @param {string} userId - The authenticated user's ID
 * @returns {Promise<string|null>} - The FCM token or null if permission denied
 */
export async function requestNotificationPermission(userId) {
  if (typeof window === 'undefined' || !messaging) {
    return null;
  }

  try {
    // Request permission
    const permission = await Notification.requestPermission();
    
    if (permission !== 'granted') {
      return null;
    }

    // Register service worker
    let registration = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
    if (!registration) {
      registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    }

    // Get FCM token
    const token = await getToken(messaging, {
      vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: registration
    });

    if (token) {
      // Save token to user's profile in Firestore
      if (userId) {
        await updateDoc(doc(db, 'users', userId), {
          fcmTokens: arrayUnion(token),
          notificationsEnabled: true,
          'settings.notificationsEnabled': true,
          updatedAt: new Date()
        });
      }
      
      return token;
    } else {
      return null;
    }
  } catch (error) {
    console.error('Error getting notification permission:', error);
    return null;
  }
}

/**
 * Disable notifications for the current device
 * @param {string} userId - The authenticated user's ID
 */
export async function disableNotifications(userId) {
  try {
    if (messaging) {
      await deleteToken(messaging);
    }

    if (userId) {
      await updateDoc(doc(db, 'users', userId), {
        notificationsEnabled: false,
        'settings.notificationsEnabled': false,
        updatedAt: new Date()
      });
    }
  } catch (error) {
    console.error('Error disabling notifications:', error);
    throw error;
  }
}

/**
 * Listen for foreground messages
 * @param {Function} callback - Function to call when message received
 */
export function onForegroundMessage(callback) {
  if (!messaging) {
    return () => {};
  }

  return onMessage(messaging, (payload) => {
    // Show browser notification
    if (Notification.permission === 'granted') {
      new Notification(payload.notification?.title || 'New notification', {
        body: payload.notification?.body || '',
        icon: payload.notification?.icon || '/favicon.svg',
        badge: '/favicon.svg',
        data: payload.data
      });
    }
    
    // Call custom callback
    if (callback) {
      callback(payload);
    }
  });
}

/**
 * Check if notifications are supported and enabled
 * @returns {boolean}
 */
export function areNotificationsSupported() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }
  return 'Notification' in window && 'serviceWorker' in navigator && !!messaging;
}

/**
 * Check current notification permission status
 * @returns {'granted' | 'denied' | 'default'}
 */
export function getNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  return Notification.permission;
}
