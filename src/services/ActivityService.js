import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

const activityCol = (uid) => collection(db, 'users', uid, 'activity');
const activityDoc = (uid, id) => doc(db, 'users', uid, 'activity', id);
const PUSHABLE_ACTIVITY_TYPES = new Set(['reaction', 'commentReaction']);

export const logActivityEvent = async (targetId, payload = {}) => {
  if (!targetId || !payload.actorId || targetId === payload.actorId) return null;
  try {
    const ref = await addDoc(activityCol(targetId), {
      ...payload,
      targetUserId: targetId,
      read: false,
      createdAt: serverTimestamp()
    });
    triggerPushNotification(targetId, payload);
    return ref;
  } catch (e) {
    console.error('Activity log failed', e);
    return null;
  }
};

export const logActivityEvents = (events = []) => (
  Promise.all(events.map((e) => logActivityEvent(e?.targetUserId, e?.payload)))
);

export const markActivityEntryRead = async (uid, id) => {
  if (!uid || !id) return false;
  try {
    await updateDoc(activityDoc(uid, id), { read: true, readAt: serverTimestamp() });
    return true;
  } catch (e) {
    console.error('Mark read failed', e);
    return false;
  }
};

export const markActivityEntriesRead = async (uid, ids = []) => {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!uid || !unique.length) return 0;
  const results = await Promise.all(unique.map((id) => markActivityEntryRead(uid, id)));
  return results.filter(Boolean).length;
};

export const removeActivityEntry = async (uid, id) => {
  if (!uid || !id) return false;
  try {
    await deleteDoc(activityDoc(uid, id));
    return true;
  } catch (e) {
    console.error('Delete activity failed', e);
    return false;
  }
};

const triggerPushNotification = async (targetId, payload = {}) => {
  if (typeof window === 'undefined' || typeof fetch !== 'function') return;
  if (!PUSHABLE_ACTIVITY_TYPES.has(payload.type)) return;
  if (!targetId || !payload.actorId) return;
  const currentUser = auth?.currentUser;
  if (!currentUser || currentUser.uid !== payload.actorId) return;

  try {
    const idToken = await currentUser.getIdToken?.();
    if (!idToken) return;

    const response = await fetch('/api/notify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`
      },
      body: JSON.stringify({ targetUserId: targetId, payload })
    });

    if (!response.ok) {
      const details = await response.text().catch(() => '');
      console.error('Notification request failed', details);
    }
  } catch (error) {
    console.error('Notification request failed', error);
  }
};
