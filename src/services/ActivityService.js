import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

const activityCol = (uid) => collection(db, 'users', uid, 'activity');
const activityDoc = (uid, id) => doc(db, 'users', uid, 'activity', id);

export const logActivityEvent = async (targetId, payload = {}) => {
  if (!targetId || !payload.actorId || targetId === payload.actorId) return null;
  try {
    return await addDoc(activityCol(targetId), {
      ...payload,
      targetUserId: targetId,
      read: false,
      createdAt: serverTimestamp()
    });
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
