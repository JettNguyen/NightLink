import {
  collection,
  getDocs,
  query,
  where,
  documentId,
  doc,
  updateDoc,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';

const userSummaryCache = new Map();
const chunkIds = (list = [], size = 10) => {
  const chunks = [];
  for (let i = 0; i < list.length; i += size) {
    chunks.push(list.slice(i, i + size));
  }
  return chunks;
};

const normalizeProfile = (id, data = {}) => ({
  id,
  displayName: data.displayName || 'Dreamer',
  username: data.username || '',
  avatarIcon: data.avatarIcon || null,
  avatarBackground: data.avatarBackground || null,
  avatarColor: data.avatarColor || null
});

export const fetchUserSummaries = async (rawIds = []) => {
  const ids = [...new Set(rawIds.filter((id) => typeof id === 'string' && id.trim().length))];
  if (!ids.length) return {};

  const pending = ids.filter((id) => !userSummaryCache.has(id));
  if (pending.length) {
    const userCollection = collection(db, 'users');
    const chunks = chunkIds(pending, 10);
    await Promise.all(chunks.map(async (chunk) => {
      try {
        const q = query(userCollection, where(documentId(), 'in', chunk));
        const snap = await getDocs(q);
        snap.forEach((docSnap) => {
          const profile = normalizeProfile(docSnap.id, docSnap.data());
          userSummaryCache.set(docSnap.id, profile);
        });
      } catch (error) {
        console.error('Failed to fetch user summaries', error);
      }
    }));
  }

  return ids.reduce((acc, id) => {
    if (userSummaryCache.has(id)) {
      acc[id] = userSummaryCache.get(id);
    }
    return acc;
  }, {});
};

export const getCachedUserSummary = (userId) => (
  (typeof userId === 'string' && userSummaryCache.get(userId)) || null
);

export const primeUserSummaryCache = (profiles = []) => {
  profiles.forEach((profile) => {
    if (profile?.id) {
      userSummaryCache.set(profile.id, normalizeProfile(profile.id, profile));
    }
  });
};

export const clearUserSummaryCache = () => {
  userSummaryCache.clear();
};

export const persistFeedSeenTimestamp = async (uid, seenAt = Date.now()) => {
  if (!uid) return false;

  try {
    await updateDoc(doc(db, 'users', uid), {
      feedSeenAtMs: seenAt,
      feedSeenAt: serverTimestamp()
    });
    return true;
  } catch (error) {
    console.error('Failed to persist feed seen timestamp', error);
    return false;
  }
};

export default fetchUserSummaries;
