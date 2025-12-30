import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc
} from 'firebase/firestore';
import { db } from '../firebase';

const activityCollectionForUser = (userId) => collection(db, 'users', userId, 'activity');
const activityEntryRef = (userId, entryId) => doc(db, 'users', userId, 'activity', entryId);

export const logActivityEvent = async (targetUserId, payload = {}) => {
  if (!targetUserId || !payload.actorId || targetUserId === payload.actorId) {
    return null;
  }

  try {
    const docPayload = {
      ...payload,
      targetUserId,
      read: false,
      createdAt: serverTimestamp()
    };
    return await addDoc(activityCollectionForUser(targetUserId), docPayload);
  } catch (error) {
    console.error('Activity event logging failed', error);
    return null;
  }
};

export const logActivityEvents = async (events = []) => (
  Promise.all(events.map((entry) => logActivityEvent(entry?.targetUserId, entry?.payload)))
);

export const markActivityEntryRead = async (userId, entryId) => {
  if (!userId || !entryId) return null;

  try {
    await updateDoc(activityEntryRef(userId, entryId), {
      read: true,
      readAt: serverTimestamp()
    });
    return true;
  } catch (error) {
    console.error('Failed to mark activity entry as read', error);
    return false;
  }
};

export const markActivityEntriesRead = async (userId, entryIds = []) => {
  const uniqueIds = Array.from(new Set(entryIds.filter(Boolean)));
  if (!userId || !uniqueIds.length) return 0;

  const results = await Promise.all(uniqueIds.map((id) => markActivityEntryRead(userId, id)));
  return results.filter(Boolean).length;
};

export const removeActivityEntry = async (userId, entryId) => {
  if (!userId || !entryId) return null;

  try {
    await deleteDoc(activityEntryRef(userId, entryId));
    return true;
  } catch (error) {
    console.error('Failed to delete activity entry', error);
    return false;
  }
};
