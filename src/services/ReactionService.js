import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { logActivityEvent } from './ActivityService';

export const updateDreamReaction = async ({
  dreamId, dreamOwnerId, dreamTitleSnapshot,
  userId, emoji, actorDisplayName, actorUsername
}) => {
  if (!dreamId || !userId) throw new Error('Missing dreamId or userId');

  const ref = doc(db, 'dreams', dreamId);

  const result = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Dream not found');

    const data = snap.data() || {};
    const reactions = { ...(data.viewerReactions || {}) };
    const counts = { ...(data.reactionCounts || {}) };
    const prev = reactions[userId] || null;

    if (!emoji && !prev) return { changed: false, prev, next: null };

    if (prev) {
      counts[prev] = Math.max((counts[prev] || 1) - 1, 0);
      delete reactions[userId];
    }

    let next = null;
    if (emoji) {
      reactions[userId] = emoji;
      counts[emoji] = (counts[emoji] || 0) + 1;
      next = emoji;
    }

    tx.update(ref, {
      viewerReactions: reactions,
      reactionCounts: counts,
      updatedAt: serverTimestamp()
    });

    return { changed: true, prev, next };
  });

  if (result?.changed && result.next && dreamOwnerId && dreamOwnerId !== userId) {
    await logActivityEvent(dreamOwnerId, {
      type: 'reaction',
      actorId: userId,
      actorDisplayName,
      actorUsername,
      emoji: result.next,
      dreamId,
      dreamOwnerId,
      dreamTitleSnapshot
    });
  }

  return result;
};

export default updateDreamReaction;

export const toggleCommentHeart = async ({
  dreamId,
  commentId,
  userId,
  actorDisplayName,
  actorUsername,
  commentAuthorId,
  dreamTitleSnapshot
}) => {
  if (!dreamId || !commentId || !userId) {
    throw new Error('Missing comment reaction params');
  }

  const ref = doc(db, 'dreams', dreamId, 'comments', commentId);
  const result = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Comment not found');
    const data = snap.data() || {};
    const heartUserIds = { ...(data.heartUserIds || {}) };
    let heartCount = Number(data.heartCount) || 0;
    const alreadyHearted = Boolean(heartUserIds[userId]);

    if (alreadyHearted) {
      delete heartUserIds[userId];
      heartCount = Math.max(heartCount - 1, 0);
    } else {
      heartUserIds[userId] = true;
      heartCount += 1;
    }

    tx.update(ref, {
      heartUserIds,
      heartCount,
      updatedAt: serverTimestamp()
    });

    return { added: !alreadyHearted, heartCount };
  });

  if (result?.added && commentAuthorId && commentAuthorId !== userId) {
    await logActivityEvent(commentAuthorId, {
      type: 'commentReaction',
      actorId: userId,
      actorDisplayName,
      actorUsername,
      dreamId,
      commentId,
      dreamTitleSnapshot,
      emoji: '💙'
    });
  }

  return result;
};
