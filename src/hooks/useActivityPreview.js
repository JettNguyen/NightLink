import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
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

  useEffect(() => {
    const followingIds = Array.isArray(viewerProfile?.followingIds)
      ? viewerProfile.followingIds.filter((id) => typeof id === 'string' && id.trim())
      : [];

    if (!viewerId || followingIds.length === 0) {
      setFollowingUpdates([]);
      setFollowingLoading(false);
      return undefined;
    }

    let cancelled = false;
    setFollowingLoading(true);

    const fetchFollowingUpdates = async () => {
      try {
        const chunks = [];
        for (let i = 0; i < followingIds.length; i += FOLLOWING_CHUNK_SIZE) {
          chunks.push(followingIds.slice(i, i + FOLLOWING_CHUNK_SIZE));
        }

        const dreamsRef = collection(db, 'dreams');
        const queries = chunks.map((chunk) => getDocs(
          query(
            dreamsRef,
            where('userId', 'in', chunk),
            orderBy('updatedAt', 'desc'),
            limit(FOLLOWING_PER_CHUNK)
          )
        ));

        const snapshots = await Promise.all(queries);
        const merged = [];
        snapshots.forEach((snapshot) => {
          snapshot.forEach((docSnap) => {
            const data = docSnap.data() || {};
            const createdAt = data.createdAt?.toDate?.() ?? null;
            const updatedAt = data.updatedAt?.toDate?.() ?? createdAt;
            merged.push({
              id: docSnap.id,
              ...data,
              createdAt,
              updatedAt
            });
          });
        });

        merged.sort((a, b) => {
          const aTime = (a.updatedAt || a.createdAt)?.getTime?.() || 0;
          const bTime = (b.updatedAt || b.createdAt)?.getTime?.() || 0;
          return bTime - aTime;
        });

        const sliced = merged.slice(0, MAX_FOLLOWING_RESULTS);
        const ownerIds = Array.from(new Set(sliced.map((entry) => entry.userId).filter(Boolean)));
        const ownerProfiles = await fetchProfilesByIds(ownerIds);
        const enriched = sliced.map((entry) => ({
          ...entry,
          ownerProfile: ownerProfiles[entry.userId] || null,
          reactionCounts: entry.reactionCounts || {},
          viewerReaction: entry.viewerReactions?.[viewerId] || entry.viewerReaction || null
        }));

        if (!cancelled) {
          setFollowingUpdates(enriched);
        }
      } catch {
        if (!cancelled) {
          setFollowingUpdates([]);
        }
      } finally {
        if (!cancelled) {
          setFollowingLoading(false);
        }
      }
    };

    fetchFollowingUpdates();
    return () => {
      cancelled = true;
    };
  }, [viewerId, viewerProfile?.followingIds]);

  const hasActivity = useMemo(() => (
    inboxEntries.length > 0
    || followingUpdates.length > 0
  ), [inboxEntries.length, followingUpdates.length]);

  return {
    viewerProfile,
    profileLoading,
    inboxEntries,
    inboxLoading,
    inboxError,
    followingUpdates,
    followingLoading,
    hasActivity
  };
}
