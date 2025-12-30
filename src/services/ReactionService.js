import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { logActivityEvent } from './ActivityService';

export const updateDreamReaction = async ({
  dreamId,
  dreamOwnerId,
  dreamTitleSnapshot,
  userId,
  emoji,
  actorDisplayName,
  actorUsername
}) => {
  if (!dreamId || !userId) {
    throw new Error('Missing dreamId or userId for reaction update');
  }

  const dreamRef = doc(db, 'dreams', dreamId);

  const result = await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(dreamRef);
    if (!snapshot.exists()) {
      throw new Error('Dream not found');
    }

    const data = snapshot.data() || {};
    const viewerReactions = { ...(data.viewerReactions || {}) };
    const reactionCounts = { ...(data.reactionCounts || {}) };
    const previous = viewerReactions[userId] || null;

    if (!emoji && !previous) {
      return { changed: false, previous, next: null };
    }

    if (previous) {
      reactionCounts[previous] = Math.max((reactionCounts[previous] || 1) - 1, 0);
      delete viewerReactions[userId];
    }

    let nextReaction = null;
    if (emoji) {
      viewerReactions[userId] = emoji;
      reactionCounts[emoji] = (reactionCounts[emoji] || 0) + 1;
      nextReaction = emoji;
    }

    transaction.update(dreamRef, {
      viewerReactions,
      reactionCounts,
      updatedAt: serverTimestamp()
    });

    return { changed: true, previous, next: nextReaction };
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
