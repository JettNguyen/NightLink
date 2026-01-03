import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where
} from 'firebase/firestore';
import { db } from '../firebase';

const DEFAULT_INBOX_LIMIT = 25;
const FOLLOWING_CHUNK_SIZE = 10;
const FOLLOWING_PER_CHUNK = 8;
const MAX_FOLLOWING_RESULTS = 20;

const normalizeIdList = (ids) => (
  Array.isArray(ids)
    ? ids.filter((id) => typeof id === 'string' && id.trim())
    : []
);

const chunkList = (list, chunkSize) => {
  const chunks = [];
  for (let i = 0; i < list.length; i += chunkSize) {
    const chunk = list.slice(i, i + chunkSize);
    if (chunk.length) {
      chunks.push(chunk);
    }
  }
  return chunks;
};

const parseDreamSnapshot = (docSnap) => {
  const data = docSnap.data() || {};
  const createdAt = data.createdAt?.toDate?.() ?? null;
  const updatedAt = data.updatedAt?.toDate?.() ?? createdAt;
  return {
    id: docSnap.id,
    ...data,
    createdAt,
    updatedAt
  };
};

const combineChunkEntries = (chunkSnapshots) => (
  Array.from(chunkSnapshots.values()).flat()
);

const dedupeEntries = (entries) => entries.reduce((acc, entry) => {
  if (entry?.id) {
    acc.set(entry.id, entry);
  }
  return acc;
}, new Map());

const sortEntriesDescending = (entries) => (
  entries.sort((a, b) => {
    const aTime = (a.updatedAt || a.createdAt)?.getTime?.() || 0;
    const bTime = (b.updatedAt || b.createdAt)?.getTime?.() || 0;
    return bTime - aTime;
  })
);

const fetchProfilesByIds = async (ids = []) => {
  const uniqueIds = Array.from(new Set(ids.filter((id) => typeof id === 'string' && id.trim())));
  if (!uniqueIds.length) {
    return {};
  }

  const lookups = await Promise.all(uniqueIds.map(async (id) => {
    try {
      const snapshot = await getDoc(doc(db, 'users', id));
      if (!snapshot.exists()) return null;
      return { id: snapshot.id, ...snapshot.data() };
    } catch {
      return null;
    }
  }));

  return lookups.filter(Boolean).reduce((acc, profile) => {
    acc[profile.id] = profile;
    return acc;
  }, {});
};

const canViewerSeeDream = (entry, ownerProfile, viewerId) => {
  if (!entry) return false;
  const ownerId = entry.userId;
  const viewerIsOwner = viewerId && ownerId === viewerId;
  const excluded = viewerId
    && Array.isArray(entry.excludedViewerIds)
    && entry.excludedViewerIds.includes(viewerId);
  if (excluded) return false;
  if (viewerIsOwner) return true;

  const visibility = entry.visibility || 'private';
  if (visibility === 'public' || visibility === 'anonymous') {
    return true;
  }

  if (visibility === 'following') {
    const authorFollowingIds = Array.isArray(ownerProfile?.followingIds)
      ? ownerProfile.followingIds
      : [];
    return viewerId ? authorFollowingIds.includes(viewerId) : false;
  }

  if (visibility === 'followers') {
    const authorFollowerIds = Array.isArray(ownerProfile?.followerIds)
      ? ownerProfile.followerIds
      : [];
    return viewerId ? authorFollowerIds.includes(viewerId) : false;
  }

  return false;
};

const buildFollowingPayload = async (combinedEntries, viewerId) => {
  const deduped = dedupeEntries(combinedEntries);
  const sorted = sortEntriesDescending(Array.from(deduped.values()));
  const limited = sorted.slice(0, MAX_FOLLOWING_RESULTS);
  const ownerIds = Array.from(new Set(limited.map((entry) => entry.userId).filter(Boolean)));

  const ownerProfiles = await fetchProfilesByIds(ownerIds);
  return limited
    .filter((entry) => canViewerSeeDream(entry, ownerProfiles[entry.userId] || null, viewerId))
    .map((entry) => ({
      ...entry,
      ownerProfile: ownerProfiles[entry.userId] || null,
      reactionCounts: entry.reactionCounts || {},
      viewerReaction: entry.viewerReactions?.[viewerId] || entry.viewerReaction || null
    }));
};

export default function useActivityPreview(viewerId, options = {}) {
  const inboxLimit = options.inboxLimit ?? DEFAULT_INBOX_LIMIT;
  const [viewerProfile, setViewerProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(Boolean(viewerId));
  const [inboxEntries, setInboxEntries] = useState([]);
  const [inboxLoading, setInboxLoading] = useState(Boolean(viewerId));
  const [inboxError, setInboxError] = useState('');
  const [followingUpdates, setFollowingUpdates] = useState([]);
  const [followingLoading, setFollowingLoading] = useState(Boolean(viewerId));

  useEffect(() => {
    if (!viewerId) {
      setViewerProfile(null);
      setProfileLoading(false);
      return undefined;
    }

    setProfileLoading(true);
    const unsubscribe = onSnapshot(doc(db, 'users', viewerId), (snapshot) => {
      setViewerProfile(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
      setProfileLoading(false);
    }, () => {
      setViewerProfile(null);
      setProfileLoading(false);
    });

    return () => unsubscribe();
  }, [viewerId]);

  useEffect(() => {
    if (!viewerId) {
      setInboxEntries([]);
      setInboxLoading(false);
      setInboxError('');
      return undefined;
    }

    setInboxLoading(true);
    setInboxError('');

    const eventsRef = collection(db, 'users', viewerId, 'activity');
    const eventsQuery = query(eventsRef, orderBy('createdAt', 'desc'), limit(inboxLimit));

    const unsubscribe = onSnapshot(eventsQuery, (snapshot) => {
      const next = snapshot.docs.map((docSnap) => {
        const data = docSnap.data() || {};
        const createdAt = data.createdAt?.toDate?.() ?? null;
        return {
          id: docSnap.id,
          ...data,
          createdAt
        };
      });
      setInboxEntries(next);
      setInboxLoading(false);
      setInboxError('');
    }, () => {
      setInboxEntries([]);
      setInboxLoading(false);
      setInboxError('Could not load activity right now.');
    });

    return () => {
      unsubscribe();
    };
  }, [viewerId, inboxLimit]);

  useEffect(() => {
    const followingIds = normalizeIdList(viewerProfile?.followingIds);

    if (!viewerId || followingIds.length === 0) {
      setFollowingUpdates([]);
      setFollowingLoading(false);
      return undefined;
    }

    setFollowingLoading(true);
    let cancelled = false;
    let refreshToken = 0;
    const chunkSnapshots = new Map();

    const recomputeFollowing = async () => {
      const requestId = ++refreshToken;
      const combined = combineChunkEntries(chunkSnapshots);

      if (!combined.length) {
        if (!cancelled && requestId === refreshToken) {
          setFollowingUpdates([]);
          setFollowingLoading(false);
        }
        return;
      }

      try {
        const payload = await buildFollowingPayload(combined, viewerId);
        if (!cancelled && requestId === refreshToken) {
          setFollowingUpdates(payload);
          setFollowingLoading(false);
        }
      } catch (error) {
        console.error('Failed to prepare following updates', error);
        if (!cancelled && requestId === refreshToken) {
          setFollowingUpdates([]);
          setFollowingLoading(false);
        }
      }
    };

    const chunks = chunkList(followingIds, FOLLOWING_CHUNK_SIZE);

    const dreamsRef = collection(db, 'dreams');
    const unsubscribes = chunks.map((chunk, index) => {
      const chunkKey = `chunk-${index}`;
      const chunkQuery = query(
        dreamsRef,
        where('userId', 'in', chunk),
        orderBy('createdAt', 'desc'),
        limit(FOLLOWING_PER_CHUNK)
      );

      return onSnapshot(chunkQuery, (snapshot) => {
        if (cancelled) return;
        const entries = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() || {};
          const createdAt = data.createdAt?.toDate?.() ?? null;
          const updatedAt = data.updatedAt?.toDate?.() ?? createdAt;
          return {
            id: docSnap.id,
            ...data,
            createdAt,
            updatedAt
          };
        });
        chunkSnapshots.set(chunkKey, entries);
        recomputeFollowing();
      }, (error) => {
        console.error('Following feed snapshot failed', error);
        chunkSnapshots.delete(chunkKey);
        recomputeFollowing();
      });
    });

    return () => {
      cancelled = true;
      unsubscribes.forEach((unsubscribe) => unsubscribe?.());
    };
  }, [viewerId, viewerProfile?.followingIds]);

  const unreadInboxCount = useMemo(() => (
    inboxEntries.filter((entry) => entry?.read === false).length
  ), [inboxEntries]);

  const hasActivity = useMemo(() => (
    inboxEntries.length > 0
    || followingUpdates.length > 0
  ), [inboxEntries.length, followingUpdates.length]);

  const hasUnreadActivity = unreadInboxCount > 0;

  const latestFollowingTimestamp = useMemo(() => (
    followingUpdates.reduce((latest, entry) => {
      const time = (entry.updatedAt || entry.createdAt)?.getTime?.() || 0;
      return time > latest ? time : latest;
    }, 0)
  ), [followingUpdates]);

  return {
    viewerProfile,
    profileLoading,
    inboxEntries,
    inboxLoading,
    inboxError,
    followingUpdates,
    followingLoading,
    hasActivity,
    unreadInboxCount,
    unreadActivityCount: unreadInboxCount,
    hasUnreadActivity,
    latestFollowingTimestamp
  };
}
