import { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHeart, faPlus } from '@fortawesome/free-solid-svg-icons';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { doc, onSnapshot, updateDoc, deleteDoc, serverTimestamp, collection, query, where, limit, getDocs, getDoc, addDoc, orderBy } from 'firebase/firestore';
import { format, formatDistanceToNow } from 'date-fns';
import { db } from '../firebase';
import LoadingIndicator from '../components/LoadingIndicator';
import { logActivityEvents } from '../services/ActivityService';
import updateDreamReaction from '../services/ReactionService';
import './DreamDetail.css';

const VISIBILITY_OPTIONS = [
  { value: 'private', label: 'Private', helper: 'Only you can see this dream.' },
  { value: 'public', label: 'Public', helper: 'Visible on your profile and following feed.' },
  { value: 'following', label: 'People you follow', helper: 'Shared only with the people you follow.' },
  { value: 'anonymous', label: 'Anonymous', helper: 'Shared publicly without your identity.' }
];

const AI_ENDPOINT = import.meta.env.VITE_AI_ENDPOINT || '/api/ai';
const ACTIVITY_EVENT_PRIORITY = { mention: 1, comment: 2, reply: 3 };
const DEFAULT_REACTION = '❤️';

const describeVisibility = (value = 'private') => {
  switch (value) {
    case 'public':
      return 'Public dream';
    case 'anonymous':
      return 'Anonymous dream';
    case 'following':
      return 'Shared with close connections';
    case 'followers':
      return 'Shared with followers';
    default:
      return 'Private dream';
  }
};

const canViewerAccessDream = (dreamData, viewerId, authorProfile) => {
  if (!dreamData) return false;
  if (dreamData.userId && dreamData.userId === viewerId) return true;
  if (!viewerId) return false;

  const excluded = Array.isArray(dreamData.excludedViewerIds) ? dreamData.excludedViewerIds : [];
  if (excluded.includes(viewerId)) return false;

  const tagged = Array.isArray(dreamData.taggedUserIds) ? dreamData.taggedUserIds : [];
  if (tagged.includes(viewerId)) return true;

  const visibility = dreamData.visibility || 'private';
  if (visibility === 'public' || visibility === 'anonymous') return true;

  const authorFollowingIds = Array.isArray(authorProfile?.followingIds) ? authorProfile.followingIds : [];
  const authorFollowerIds = Array.isArray(authorProfile?.followerIds) ? authorProfile.followerIds : [];

  if (visibility === 'following') {
    return authorFollowingIds.includes(viewerId);
  }

  if (visibility === 'followers') {
    return authorFollowerIds.includes(viewerId);
  }

  return false;
};

export default function DreamDetail({ user }) {
  const { dreamId } = useParams();
  const navigate = useNavigate();
  const [dream, setDream] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [updatingVisibility, setUpdatingVisibility] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDate, setEditingDate] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const [dateInput, setDateInput] = useState('');
  const [editingContent, setEditingContent] = useState(false);
  const [contentInput, setContentInput] = useState('');
  const [editableTags, setEditableTags] = useState([]);
  const [newTag, setNewTag] = useState('');
  const [applyingAiTitle, setApplyingAiTitle] = useState(false);
  const [audienceOptions, setAudienceOptions] = useState([]);
  const [audienceBusy, setAudienceBusy] = useState(false);
  const [audienceLoading, setAudienceLoading] = useState(false);
  const [audienceQuery, setAudienceQuery] = useState('');
  const [excludedViewerIds, setExcludedViewerIds] = useState([]);
  const [taggedPeople, setTaggedPeople] = useState([]);
  const [tagHandle, setTagHandle] = useState('');
  const [taggingBusy, setTaggingBusy] = useState(false);
  const [taggingStatus, setTaggingStatus] = useState('');
  const [viewerProfile, setViewerProfile] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [commentInput, setCommentInput] = useState('');
  const [commentBusy, setCommentBusy] = useState(false);
  const [commentStatus, setCommentStatus] = useState('');
  const [commentError, setCommentError] = useState('');
  const [removingCommentId, setRemovingCommentId] = useState(null);
  const [sharingControlsOpen, setSharingControlsOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState(null);
  const [expandedThreads, setExpandedThreads] = useState({});
  const [reactionSnapshot, setReactionSnapshot] = useState({ counts: {}, viewerReaction: null });
  const [customEmojiValue, setCustomEmojiValue] = useState('');
  const [customEmojiPickerOpen, setCustomEmojiPickerOpen] = useState(false);
  const viewerId = user?.uid || null;
  const [authorProfile, setAuthorProfile] = useState(null);
  const [isOwner, setIsOwner] = useState(false);
  const location = useLocation();
  const fromNav = location.state?.fromNav || null;
  const commentInputRef = useRef(null);
  const commentLookup = useMemo(() => (
    comments.reduce((acc, entry) => {
      if (entry?.id) {
        acc[entry.id] = entry;
      }
      return acc;
    }, {})
  ), [comments]);
  const parentLookup = useMemo(() => (
    comments.reduce((acc, entry) => {
      if (entry?.id) {
        acc[entry.id] = entry.parentCommentId || null;
      }
      return acc;
    }, {})
  ), [comments]);
  const commentThreads = useMemo(() => {
    if (!comments.length) return [];
    const clones = comments.map((entry) => ({ ...entry, replies: [] }));
    const cloneMap = clones.reduce((acc, entry) => {
      if (entry?.id) {
        acc[entry.id] = entry;
      }
      return acc;
    }, {});

    const roots = [];
    clones.forEach((entry) => {
      const parentId = entry.parentCommentId;
      if (parentId && cloneMap[parentId]) {
        cloneMap[parentId].replies.push(entry);
      } else {
        roots.push(entry);
      }
    });

    const sortBranch = (node) => {
      if (!node?.replies?.length) return;
      node.replies.sort((a, b) => {
        const aTime = a.createdAt?.getTime?.() || 0;
        const bTime = b.createdAt?.getTime?.() || 0;
        return aTime - bTime;
      });
      node.replies.forEach(sortBranch);
    };

    roots.forEach(sortBranch);
    return roots;
  }, [comments]);

  const totalDreamReactions = useMemo(() => (
    Object.values(reactionSnapshot.counts || {}).reduce((sum, value) => sum + (value || 0), 0)
  ), [reactionSnapshot]);

  const getRootCommentId = (commentId) => {
    if (!commentId) return null;
    let currentId = commentId;
    const visited = new Set();
    while (parentLookup[currentId]) {
      if (visited.has(currentId)) break;
      visited.add(currentId);
      currentId = parentLookup[currentId];
    }
    return currentId || commentId;
  };

  const toggleThreadVisibility = (threadId) => {
    if (!threadId) return;
    setExpandedThreads((prev) => ({
      ...prev,
      [threadId]: !prev[threadId]
    }));
  };

  const clearReplyTarget = () => {
    setReplyTarget(null);
  };

  const closeCustomEmojiPicker = () => {
    setCustomEmojiPickerOpen(false);
    setCustomEmojiValue('');
  };

  const openCustomEmojiPicker = () => {
    setCustomEmojiPickerOpen(true);
    setCustomEmojiValue('');
  };

  const handleCustomEmojiChange = (value) => {
    const normalized = Array.from(value || '').slice(-2).join('');
    setCustomEmojiValue(normalized);
  };

  const handleCustomEmojiSubmit = (event) => {
    event.preventDefault();
    const emoji = customEmojiValue.trim();
    if (!emoji) return;
    handleDreamReactionSelection(emoji);
    closeCustomEmojiPicker();
  };

  const handleDreamReactionSelection = useCallback(async (emoji) => {
    if (!viewerId) {
      alert('Sign in to react to dreams');
      return;
    }

    if (!dream?.id) {
      return;
    }

    const previousSnapshot = {
      counts: reactionSnapshot.counts || {},
      viewerReaction: reactionSnapshot.viewerReaction || null
    };

    const currentReaction = previousSnapshot.viewerReaction;
    const nextReaction = emoji === currentReaction ? null : emoji;
    const optimisticCounts = { ...previousSnapshot.counts };

    if (currentReaction) {
      optimisticCounts[currentReaction] = Math.max((optimisticCounts[currentReaction] || 1) - 1, 0);
    }

    if (nextReaction) {
      optimisticCounts[nextReaction] = (optimisticCounts[nextReaction] || 0) + 1;
    }

    setReactionSnapshot({
      counts: optimisticCounts,
      viewerReaction: nextReaction
    });
    setCustomEmojiPickerOpen(false);
    setCustomEmojiValue('');

    try {
      await updateDreamReaction({
        dreamId: dream.id,
        dreamOwnerId: dream.userId,
        dreamTitleSnapshot: dream.title || dream.aiTitle || 'Dream entry',
        userId: viewerId,
        emoji: nextReaction,
        actorDisplayName: user?.displayName || user?.email || 'NightLink dreamer',
        actorUsername: user?.username || user?.handle || null
      });
    } catch (error) {
      console.error('Failed to update reaction', error);
      setReactionSnapshot(previousSnapshot);
    }
  }, [dream, reactionSnapshot, user, viewerId]);

  const containerClass = 'page-container dream-detail-page';
  const goBack = () => {
    if (window.history.length > 2) {
      navigate(-1);
      return;
    }
    if (fromNav) {
      navigate(fromNav);
      return;
    }
    navigate(isOwner ? '/journal' : '/feed');
  };

  useEffect(() => {
    if (!isOwner) {
      setEditingTitle(false);
      setEditingDate(false);
      setEditingContent(false);
    }
  }, [isOwner]);

  useEffect(() => {
    if (!viewerId) {
      setViewerProfile(null);
      return undefined;
    }

    let cancelled = false;
    const loadViewerProfile = async () => {
      try {
        const viewerSnap = await getDoc(doc(db, 'users', viewerId));
        if (cancelled) return;
        setViewerProfile(viewerSnap.exists() ? { id: viewerSnap.id, ...viewerSnap.data() } : null);
      } catch {
        if (!cancelled) {
          setViewerProfile(null);
        }
      }
    };

    loadViewerProfile();
    return () => {
      cancelled = true;
    };
  }, [viewerId]);

  useEffect(() => {
    if (!dreamId) {
      setError('Missing dream id.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    let cancelled = false;

    const ref = doc(db, 'dreams', dreamId);
    const unsubscribe = onSnapshot(ref, (snapshot) => {
      (async () => {
        if (!snapshot.exists()) {
          if (!cancelled) {
            setError('Dream not found.');
            setDream(null);
            setLoading(false);
          }
          return;
        }

        const data = snapshot.data();
        const ownerId = data.userId || null;
        let resolvedAuthorProfile = null;

        if (ownerId) {
          try {
            const authorSnap = await getDoc(doc(db, 'users', ownerId));
            if (authorSnap.exists()) {
              resolvedAuthorProfile = { id: authorSnap.id, ...authorSnap.data() };
            }
          } catch {
            resolvedAuthorProfile = null;
          }
        }

        const hasAccess = canViewerAccessDream(data, viewerId, resolvedAuthorProfile);
        if (!hasAccess) {
          if (!cancelled) {
            setError('You do not have permission to view this dream.');
            setDream(null);
            setAuthorProfile(resolvedAuthorProfile);
            setIsOwner(false);
            setLoading(false);
          }
          return;
        }

        if (cancelled) return;

        const createdAtDate = data.createdAt?.toDate?.() ?? data.createdAt ?? null;

        setDream({
          id: snapshot.id,
          ...data,
          visibility: data.visibility || 'private',
          createdAt: createdAtDate
        });
        setAuthorProfile(resolvedAuthorProfile);
        setIsOwner(Boolean(ownerId && viewerId && ownerId === viewerId));
        setTitleInput(data.title || '');
        setDateInput(createdAtDate ? format(createdAtDate, 'yyyy-MM-dd') : '');
        setContentInput(data.content || '');
        setEditableTags(Array.isArray(data.tags) ? data.tags : []);
        setExcludedViewerIds(Array.isArray(data.excludedViewerIds) ? data.excludedViewerIds : []);
        setTaggedPeople(Array.isArray(data.taggedUsers) ? data.taggedUsers : []);
        setTaggingStatus('');
        setTagHandle('');
        setStatusMessage('');
        setLoading(false);
      })();
    }, () => {
      if (!cancelled) {
        setError('Failed to load this dream.');
        setDream(null);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [dreamId, viewerId]);

  useEffect(() => {
    if (!dreamId) {
      setComments([]);
      setCommentsLoading(false);
      return undefined;
    }

    setCommentsLoading(true);
    setCommentError('');
    const commentsRef = collection(db, 'dreams', dreamId, 'comments');
    const commentsQuery = query(commentsRef, orderBy('createdAt', 'asc'));
    const unsubscribe = onSnapshot(commentsQuery, (snapshot) => {
      const nextComments = snapshot.docs.map((docSnap) => {
        const data = docSnap.data() || {};
        const createdAt = data.createdAt?.toDate?.() ?? null;
        return {
          id: docSnap.id,
          ...data,
          createdAt
        };
      });
      setComments(nextComments);
      setCommentsLoading(false);
    }, () => {
      setCommentError('Could not load comments.');
      setComments([]);
      setCommentsLoading(false);
    });

    return () => unsubscribe();
  }, [dreamId]);

  useEffect(() => {
    if (!dream) {
      setReactionSnapshot({ counts: {}, viewerReaction: null });
      setCustomEmojiPickerOpen(false);
      setCustomEmojiValue('');
      return;
    }

    setReactionSnapshot({
      counts: dream.reactionCounts || {},
      viewerReaction: dream.viewerReactions?.[viewerId] || null
    });
    setCustomEmojiPickerOpen(false);
    setCustomEmojiValue('');
  }, [dream, viewerId]);

  useEffect(() => {
    if (!replyTarget) return;
    if (!comments.some((comment) => comment.id === replyTarget.id)) {
      setReplyTarget(null);
    }
  }, [comments, replyTarget]);

  const formattedDate = useMemo(() => {
    if (!dream?.createdAt) return '';
    try {
      return format(dream.createdAt, 'MMMM d, yyyy');
    } catch {
      return '';
    }
  }, [dream?.createdAt]);

  useEffect(() => {
    if (!user?.uid || !dream || dream.userId !== user.uid) {
      setAudienceOptions([]);
      setAudienceLoading(false);
      setAudienceQuery('');
      return undefined;
    }

    let cancelled = false;
    setAudienceLoading(true);
    setAudienceQuery('');

    const loadFollowing = async () => {
      try {
        const viewerSnap = await getDoc(doc(db, 'users', user.uid));
        const viewerData = viewerSnap.data() || {};
        const followingIds = Array.isArray(viewerData.followingIds) ? viewerData.followingIds : [];
        const connectionIds = followingIds.filter((id) => id && id !== user.uid);
        if (!connectionIds.length) {
          if (!cancelled) setAudienceOptions([]);
          return;
        }

        const profiles = await Promise.all(
          connectionIds.map(async (id) => {
            try {
              const profileSnap = await getDoc(doc(db, 'users', id));
              if (!profileSnap.exists()) return null;
              const profileData = profileSnap.data();
              return {
                id,
                displayName: profileData.displayName || 'Dreamer',
                username: profileData.username || '',
              };
            } catch {
              return null;
            }
          })
        );

        if (!cancelled) {
          setAudienceOptions(profiles.filter(Boolean));
        }
      } catch {
        if (!cancelled) setAudienceOptions([]);
      } finally {
        if (!cancelled) setAudienceLoading(false);
      }
    };

    loadFollowing();
    return () => {
      cancelled = true;
    };
  }, [user?.uid, dream?.userId]);

  const handleVisibilityChange = async (value) => {
    if (!dream || !isOwner || dream.visibility === value) return;
    setUpdatingVisibility(true);
    try {
      await updateDoc(doc(db, 'dreams', dream.id), {
        visibility: value,
        updatedAt: serverTimestamp()
      });
    } catch {
      setError('Could not update visibility.');
    } finally {
      setUpdatingVisibility(false);
    }
  };

  const handleSaveTitle = async () => {
    if (!dream || !isOwner) return;
    try {
      await updateDoc(doc(db, 'dreams', dream.id), {
        title: titleInput.trim(),
        updatedAt: serverTimestamp()
      });
      setEditingTitle(false);
    } catch {
      setError('Could not update title.');
    }
  };

  const handleSaveDate = async () => {
    if (!dream || !isOwner || !dateInput) return;
    try {
      await updateDoc(doc(db, 'dreams', dream.id), {
        createdAt: new Date(dateInput),
        updatedAt: serverTimestamp()
      });
      setEditingDate(false);
    } catch {
      setError('Could not update date.');
    }
  };

  const handleCancelContentEdit = () => {
    setEditingContent(false);
    setContentInput(dream?.content || '');
    setEditableTags(Array.isArray(dream?.tags) ? dream.tags : []);
    setNewTag('');
  };

  const handleSaveContent = async () => {
    if (!dream || !isOwner || !contentInput.trim()) return;
    try {
      await updateDoc(doc(db, 'dreams', dream.id), {
        content: contentInput.trim(),
        tags: editableTags,
        updatedAt: serverTimestamp()
      });
      setEditingContent(false);
      setNewTag('');
    } catch {
      setError('Could not update dream content.');
    }
  };

  const handleAddTag = () => {
    const trimmed = newTag.trim();
    if (!trimmed || editableTags.some((tag) => tag.value === trimmed)) return;
    setEditableTags((prev) => [...prev, { value: trimmed, category: 'theme' }]);
    setNewTag('');
  };

  const handleRemoveTag = (value) => {
    setEditableTags((prev) => prev.filter((tag) => tag.value !== value));
  };

  const persistAudience = async (nextIds) => {
    if (!dream || !isOwner) return;
    setAudienceBusy(true);
    try {
      await updateDoc(doc(db, 'dreams', dream.id), {
        excludedViewerIds: nextIds,
        updatedAt: serverTimestamp()
      });
      setExcludedViewerIds(nextIds);
    } catch {
      setError('Could not update audience overrides.');
    } finally {
      setAudienceBusy(false);
    }
  };

  const handleToggleAudience = (viewerId) => {
    if (!viewerId || !dream || !isOwner) return;
    const next = excludedViewerIds.includes(viewerId)
      ? excludedViewerIds.filter((id) => id !== viewerId)
      : [...excludedViewerIds, viewerId];
    persistAudience(next);
  };

  const normalizeHandle = (value = '') => value.replace(/^@/, '').trim().toLowerCase();

  const extractMentionHandles = (value = '') => {
    const matches = new Set();
    const mentionPattern = /@([a-zA-Z0-9_]+)/g;
    let match = mentionPattern.exec(value);
    while (match) {
      const normalized = normalizeHandle(match[1]);
      if (normalized) {
        matches.add(normalized);
      }
      match = mentionPattern.exec(value);
    }
    return Array.from(matches);
  };

  const resolveMentionTargets = async (text = '') => {
    const handles = extractMentionHandles(text);
    if (!handles.length) {
      return { ids: [], handles: [] };
    }

    const idSet = new Set();
    const usersRef = collection(db, 'users');
    const chunkSize = 10;
    const queries = [];
    for (let i = 0; i < handles.length; i += chunkSize) {
      const slice = handles.slice(i, i + chunkSize);
      queries.push(getDocs(query(usersRef, where('normalizedUsername', 'in', slice))));
    }

    try {
      const snapshots = await Promise.all(queries);
      snapshots.forEach((snapshot) => {
        snapshot.forEach((docSnap) => {
          idSet.add(docSnap.id);
        });
      });
    } catch {
      return { ids: [], handles };
    }

    return {
      ids: Array.from(idSet),
      handles
    };
  };

  const tagSuggestions = useMemo(() => {
    const normalized = normalizeHandle(tagHandle);
    if (!normalized) return [];
    return audienceOptions
      .filter((profile) => {
        if (!profile?.id) return false;
        if (profile.id === user?.uid) return false;
        if (taggedPeople.some((entry) => entry.userId === profile.id)) {
          return false;
        }
        const username = (profile.username || '').toLowerCase();
        const displayName = (profile.displayName || '').toLowerCase();
        return username.includes(normalized) || displayName.includes(normalized);
      })
      .slice(0, 5);
  }, [audienceOptions, tagHandle, taggedPeople, user?.uid]);

  const audienceLookup = useMemo(() => (
    audienceOptions.reduce((acc, profile) => {
      acc[profile.id] = profile;
      return acc;
    }, {})
  ), [audienceOptions]);

  const filteredAudience = useMemo(() => {
    const normalized = audienceQuery.trim().toLowerCase();
    if (!normalized) return [];
    return audienceOptions.filter((profile) => {
      const label = `${profile.displayName || ''} ${profile.username || ''}`.toLowerCase();
      return label.includes(normalized);
    });
  }, [audienceOptions, audienceQuery]);

  const persistTaggedPeople = async (nextList, successMessage) => {
    if (!dream || !isOwner) return;
    setTaggingBusy(true);
    setTaggingStatus('');
    try {
      await updateDoc(doc(db, 'dreams', dream.id), {
        taggedUsers: nextList,
        taggedUserIds: nextList.map((entry) => entry.userId),
        updatedAt: serverTimestamp()
      });
      setTaggedPeople(nextList);
      setTagHandle('');
      if (successMessage) {
        setTaggingStatus(successMessage);
      }
    } catch {
      setTaggingStatus('Could not update tagged dreamers.');
    } finally {
      setTaggingBusy(false);
    }
  };

  const handleRemoveTaggedPerson = (personId) => {
    if (!isOwner) return;
    const next = taggedPeople.filter((entry) => entry.userId !== personId);
    persistTaggedPeople(next, 'Removed.');
  };

  const handleSelectTagSuggestion = (profile) => {
    if (!profile?.id || taggingBusy || !isOwner) return;
    if (taggedPeople.some((entry) => entry.userId === profile.id)) {
      setTaggingStatus('Already tagged.');
      return;
    }
    const next = [
      ...taggedPeople,
      {
        userId: profile.id,
        username: profile.username || '',
        displayName: profile.displayName || 'Dreamer'
      }
    ];
    setTagHandle('');
    persistTaggedPeople(next, 'Tagged successfully.');
  };

  const handleAddTaggedPerson = async () => {
    if (taggingBusy || !isOwner) return;
    const raw = tagHandle.trim();
    if (!raw || !user?.uid) return;
    const normalizedHandle = normalizeHandle(raw);
    if (!normalizedHandle) return;
    if (taggedPeople.some((entry) => entry.username?.toLowerCase() === normalizedHandle)) {
      setTaggingStatus('Already tagged.');
      setTagHandle('');
      return;
    }

    try {
      const usersRef = collection(db, 'users');
      const matches = await getDocs(query(usersRef, where('normalizedUsername', '==', normalizedHandle), limit(1)));
      if (matches.empty) {
        setTaggingStatus('No user found for that handle.');
        return;
      }

      const match = matches.docs[0];
      if (match.id === user.uid) {
        setTaggingStatus('You are already the author.');
        return;
      }

      if (taggedPeople.some((entry) => entry.userId === match.id)) {
        setTaggingStatus('Already tagged.');
        return;
      }

      const data = match.data();
      const next = [
        ...taggedPeople,
        {
          userId: match.id,
          username: data.username || normalizedHandle,
          displayName: data.displayName || 'Dreamer'
        }
      ];
      await persistTaggedPeople(next, 'Tagged successfully.');
    } catch {
      setTaggingStatus('Could not tag that user.');
    }
  };

  const handleSubmitComment = async () => {
    if (!viewerId || commentBusy) return;
    const trimmed = commentInput.trim();
    const activeDreamId = dream?.id || dreamId;
    if (!trimmed || !activeDreamId) return;

    setCommentBusy(true);
    setCommentStatus('');
    try {
      const currentReplyTarget = replyTarget;
      const mentionTargets = await resolveMentionTargets(trimmed);
      const mentionHandles = Array.isArray(mentionTargets?.handles) ? mentionTargets.handles : [];
      const activityTargets = new Set(mentionTargets.ids);
      if (dream?.userId && dream.userId !== viewerId) {
        activityTargets.add(dream.userId);
      }
      if (currentReplyTarget?.userId && currentReplyTarget.userId !== viewerId) {
        activityTargets.add(currentReplyTarget.userId);
      }
      const activityTargetIds = Array.from(activityTargets);
      const snapshotTitle = dream?.title?.trim()
        || (dream?.aiGenerated ? dream?.aiTitle : '')
        || 'Untitled dream';
      const commentsRef = collection(db, 'dreams', activeDreamId, 'comments');
      const commentDocRef = await addDoc(commentsRef, {
        content: trimmed,
        userId: viewerId,
        authorDisplayName: viewerProfile?.displayName || user?.displayName || 'Dreamer',
        authorUsername: viewerProfile?.username || user?.username || '',
        dreamId: activeDreamId,
        dreamOwnerId: dream?.userId || null,
        dreamOwnerUsername: authorProfile?.username || '',
        dreamTitleSnapshot: snapshotTitle,
        mentions: mentionTargets.ids,
        mentionHandles: mentionTargets.handles,
        parentCommentId: currentReplyTarget?.id || null,
        parentCommentUserId: currentReplyTarget?.userId || null,
        activityTargetIds,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      const actorDisplayName = viewerProfile?.displayName || user?.displayName || 'Dreamer';
      const actorUsername = viewerProfile?.username || user?.username || '';
      const targetEventMap = new Map();
      const registerActivity = (targetId, type) => {
        if (!targetId || targetId === viewerId) return;
        const priority = ACTIVITY_EVENT_PRIORITY[type] || 0;
        const existing = targetEventMap.get(targetId);
        if (!existing || priority > existing.priority) {
          targetEventMap.set(targetId, { type, priority });
        }
      };

      (mentionTargets.ids || []).forEach((targetId) => registerActivity(targetId, 'mention'));
      if (dream?.userId) {
        registerActivity(dream.userId, 'comment');
      }
      if (currentReplyTarget?.userId) {
        registerActivity(currentReplyTarget.userId, 'reply');
      }

      const basePayload = {
        actorId: viewerId,
        actorDisplayName,
        actorUsername,
        dreamId: activeDreamId,
        dreamOwnerId: dream?.userId || null,
        dreamOwnerUsername: authorProfile?.username || '',
        dreamTitleSnapshot: snapshotTitle,
        commentId: commentDocRef.id,
        parentCommentId: currentReplyTarget?.id || null,
        parentCommentUserId: currentReplyTarget?.userId || null,
        content: trimmed,
        mentionHandles
      };

      const events = Array.from(targetEventMap.entries()).map(([targetUserId, meta]) => ({
        targetUserId,
        payload: {
          ...basePayload,
          type: meta.type
        }
      }));

      if (events.length) {
        try {
          await logActivityEvents(events);
        } catch (activityError) {
          console.error('logActivityEvents failed', activityError);
        }
      }
      setCommentInput('');
      setCommentStatus('Posted.');
      if (currentReplyTarget?.rootId) {
        setExpandedThreads((prev) => ({
          ...prev,
          [currentReplyTarget.rootId]: true
        }));
      }
      setReplyTarget(null);
    } catch {
      setCommentStatus('Could not post your comment.');
    } finally {
      setCommentBusy(false);
    }
  };

  const handleDeleteComment = async (commentId, authorId) => {
    if (!commentId || !dream?.id || !viewerId) return;
    if (!isOwner && authorId !== viewerId) return;
    if (!window.confirm('Remove this comment?')) return;

    setRemovingCommentId(commentId);
    setCommentStatus('');
    try {
      await deleteDoc(doc(db, 'dreams', dream.id, 'comments', commentId));
    } catch {
      setCommentStatus('Could not remove that comment.');
    } finally {
      setRemovingCommentId(null);
    }
  };

  const handleReplyToComment = (entry) => {
    if (!viewerId || !entry?.id) return;
    if (entry.authorUsername) {
      const mention = `@${entry.authorUsername}`;
      setCommentInput((prev) => {
        const existing = prev || '';
        if (existing.toLowerCase().includes(mention.toLowerCase())) {
          return existing;
        }
        const spacer = existing.trim().length ? ' ' : '';
        return `${existing}${spacer}${mention} `;
      });
    }
    const rootId = getRootCommentId(entry.id) || entry.id;
    setReplyTarget({
      id: entry.id,
      userId: entry.userId || null,
      authorDisplayName: entry.authorDisplayName || 'Dreamer',
      authorUsername: entry.authorUsername || '',
      rootId
    });
    setExpandedThreads((prev) => ({
      ...prev,
      [rootId]: true
    }));
    setCommentStatus('');
    requestAnimationFrame(() => {
      commentInputRef.current?.focus();
    });
  };

  const handleAnalyzeDream = async () => {
    if (!dream || !isOwner || dream.id.startsWith('local-')) return;

    const trimmedContent = (dream.content || '').trim();
    if (!trimmedContent) {
      setStatusMessage('Dream content is empty, nothing to analyze.');
      return;
    }

    setAnalyzing(true);
    setStatusMessage('');

    try {
      const idToken = await user?.getIdToken?.();
      if (!idToken) {
        setStatusMessage('Please sign in again to use AI features.');
        setAnalyzing(false);
        return;
      }

      const response = await fetch(AI_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dreamText: trimmedContent,
          idToken
        })
      });

      const raw = await response.text();
      let payload = null;
      try {
        payload = raw ? JSON.parse(raw) : null;
      } catch {
        payload = null;
      }

      if (!response.ok) {
        throw new Error(payload?.error || `Summary service error (HTTP ${response.status})`);
      }

      const generatedTitle = payload?.title?.trim() || '';
      const generatedInsights = (payload?.themes || payload?.summary || payload?.insights || '').trim();
      const updates = { aiGenerated: true };

      if (generatedTitle) {
        updates.aiTitle = generatedTitle;
        if (!dream.title?.trim()) {
          updates.title = generatedTitle;
        }
      }

      if (generatedInsights) {
        updates.aiInsights = generatedInsights;
      }

      if (!generatedTitle || !generatedInsights) {
        throw new Error('AI response was incomplete.');
      }

      await updateDoc(doc(db, 'dreams', dream.id), {
        ...updates,
        updatedAt: serverTimestamp()
      });

      setStatusMessage('Title and summary updated.');
    } catch (err) {
      setStatusMessage(err.message || 'Summary generation failed.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleApplyAiTitle = async () => {
    if (!dream?.aiTitle || !isOwner) return;
    setApplyingAiTitle(true);
    setStatusMessage('');

    try {
      await updateDoc(doc(db, 'dreams', dream.id), {
        title: dream.aiTitle,
        updatedAt: serverTimestamp()
      });
      setStatusMessage('Title updated from AI suggestion.');
    } catch {
      setStatusMessage('Could not apply AI title.');
    } finally {
      setApplyingAiTitle(false);
    }
  };

  const handleDelete = async () => {
    if (!dream || !isOwner || dream.id.startsWith('local-')) return;
    if (!window.confirm('Delete this dream? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'dreams', dream.id));
      navigate('/journal');
    } catch {
      setError('Failed to delete this dream.');
      setDeleting(false);
    }
  };

  const renderCommentCard = (entry, depth = 0) => {
    const canRemove = isOwner || entry.userId === viewerId;
    const relativeTime = entry.createdAt ? formatDistanceToNow(entry.createdAt, { addSuffix: true }) : 'Just now';
    const replyingTo = entry.parentCommentId ? commentLookup[entry.parentCommentId] : null;
    return (
      <div className={`comment-card${depth ? ' comment-card-reply' : ''}`}>
        <div className="comment-meta">
          <div className="comment-meta-names">
            <span className="comment-author">{entry.authorDisplayName || 'Dreamer'}</span>
            {entry.authorUsername && <span className="comment-handle">@{entry.authorUsername}</span>}
          </div>
          <span className="comment-time">{relativeTime}</span>
        </div>
        {replyingTo && (
          <p className="comment-reply-context">
            Replying to {replyingTo.authorUsername ? `@${replyingTo.authorUsername}` : replyingTo.authorDisplayName || 'this comment'}
          </p>
        )}
        <p className="comment-body">{entry.content || ''}</p>
        {(viewerId || canRemove) ? (
          <div className="comment-actions">
            {viewerId ? (
              <button
                type="button"
                className="comment-reply-btn"
                onClick={() => handleReplyToComment(entry)}
              >
                Reply
              </button>
            ) : null}
            {canRemove && (
              <button
                type="button"
                className="comment-delete-btn"
                onClick={() => handleDeleteComment(entry.id, entry.userId)}
                disabled={removingCommentId === entry.id}
              >
                {removingCommentId === entry.id ? 'Removing…' : 'Remove'}
              </button>
            )}
          </div>
        ) : null}
      </div>
    );
  };

  const renderCommentThread = (entry, depth = 0) => {
    const hasReplies = Array.isArray(entry.replies) && entry.replies.length > 0;
    if (depth === 0) {
      const isExpanded = expandedThreads[entry.id];
      return (
        <div key={entry.id} className="comment-thread">
          {renderCommentCard(entry, depth)}
          {hasReplies && (
            <>
              <button
                type="button"
                className="comment-replies-toggle"
                onClick={() => toggleThreadVisibility(entry.id)}
              >
                {isExpanded ? 'Hide replies' : `View replies (${entry.replies.length})`}
              </button>
              {isExpanded && (
                <div className="comment-thread-children">
                  {entry.replies.map((child) => renderCommentThread(child, depth + 1))}
                </div>
              )}
            </>
          )}
        </div>
      );
    }

    return (
      <div key={entry.id} className="comment-thread nested">
        {renderCommentCard(entry, depth)}
        {hasReplies && (
          <div className="comment-thread-children">
            {entry.replies.map((child) => renderCommentThread(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className={containerClass}>
        <div className="detail-placeholder loading-slot">
          <LoadingIndicator label="Loading dream…" size="lg" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={containerClass}>
        <button className="detail-back-btn" type="button" onClick={goBack}>
          <span className="detail-back-icon" aria-hidden="true">&larr;</span>
          <span>Go back</span>
        </button>
        <div className="detail-error">{error}</div>
      </div>
    );
  }

  if (!dream) {
    return (
      <div className={containerClass}>
        <button className="detail-back-btn" type="button" onClick={goBack}>
          <span className="detail-back-icon" aria-hidden="true">&larr;</span>
          <span>Go back</span>
        </button>
        <div className="detail-error">Dream not available.</div>
      </div>
    );
  }

  const titleText = dream.title?.trim() || (dream.aiGenerated && dream.aiTitle) || 'Untitled dream';
  const hasAudienceQuery = audienceQuery.trim().length > 0;
  const commentCountLabel = comments.length ? ` (${comments.length})` : '';
  const visibilitySummary = describeVisibility(dream.visibility);

  return (
    <div className={containerClass}>
      <div className="detail-card">
        <div className="detail-toolbar">
          <button
            type="button"
            className="detail-back-btn"
            onClick={goBack}
          >
            <span className="detail-back-icon" aria-hidden="true">&larr;</span>
            <span>Go back</span>
          </button>
        </div>
        <div className="detail-head">
          <div className="detail-title-block">
            {isOwner ? (
              editingTitle ? (
                <div className="detail-title-edit">
                  <input
                    type="text"
                    className="detail-title-input"
                    placeholder="Enter a title"
                    value={titleInput}
                    onChange={(e) => setTitleInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSaveTitle();
                      }
                    }}
                    autoFocus
                  />
                  <button type="button" className="ghost-btn" onClick={handleSaveTitle}>Save</button>
                  <button type="button" className="ghost-btn" onClick={() => setEditingTitle(false)}>Cancel</button>
                </div>
              ) : (
                <h1
                  className="detail-title detail-title-editable"
                  onClick={() => setEditingTitle(true)}
                  role="button"
                  tabIndex={0}
                >
                  {titleText} <span className="edit-hint">✎</span>
                </h1>
              )
            ) : (
              <h1 className="detail-title">{titleText}</h1>
            )}
            {isOwner && !editingTitle && dream.aiTitle && dream.aiTitle !== (dream.title || '').trim() ? (
              <button type="button" className="ghost-btn" onClick={handleApplyAiTitle} disabled={applyingAiTitle}>
                {applyingAiTitle ? 'Applying…' : 'Use AI title'}
              </button>
            ) : null}
          </div>
          <div className="detail-date-block">
            {isOwner && editingDate ? (
              <div className="detail-date-edit detail-date-edit--standalone">
                <input
                  type="date"
                  className="detail-date-input"
                  value={dateInput}
                  onChange={(e) => setDateInput(e.target.value)}
                />
                <button type="button" className="ghost-btn" onClick={handleSaveDate}>Save</button>
                <button type="button" className="ghost-btn" onClick={() => setEditingDate(false)}>Cancel</button>
              </div>
            ) : formattedDate ? (
              isOwner ? (
                <button
                  type="button"
                  className="detail-date-pill detail-date-pill--interactive"
                  onClick={() => setEditingDate(true)}
                >
                  {formattedDate}
                  <span className="edit-hint">✎</span>
                </button>
              ) : (
                <div className="detail-date-pill">{formattedDate}</div>
              )
            ) : null}
          </div>
        </div>

        <div className="detail-body">
            {isOwner && editingContent ? (
              <>
                <textarea
                  className="detail-textarea"
                  value={contentInput}
                  onChange={(e) => setContentInput(e.target.value)}
                />
                <div className="detail-tags-editor">
                  <label htmlFor="detail-tag-input">Tags</label>
                  <div className="detail-tag-input-row">
                    <input
                      id="detail-tag-input"
                      type="text"
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddTag();
                        }
                      }}
                      placeholder="Add a tag"
                    />
                    <button type="button" className="add-tag-btn" onClick={handleAddTag}>+ Tag</button>
                  </div>
                  {editableTags.length ? (
                    <div className="detail-tag-list">
                      {editableTags.map((tag) => (
                        <span className="detail-tag-chip" key={`edit-tag-${tag.value}`}>
                          {tag.value}
                          <button type="button" className="detail-tag-remove" onClick={() => handleRemoveTag(tag.value)} aria-label={`Remove tag ${tag.value}`}>
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="detail-edit-actions">
                  <button type="button" className="ghost-btn" onClick={handleCancelContentEdit}>Cancel</button>
                  <button
                    type="button"
                    className="primary-btn"
                    onClick={handleSaveContent}
                    disabled={!contentInput.trim()}
                  >
                    Save changes
                  </button>
                </div>
              </>
            ) : (
              <>
                <p>{dream.content}</p>
                {dream.tags?.length ? (
                  <div className="detail-tags detail-tags-inline">
                    {dream.tags.map((tag, index) => (
                      <span className="tag" key={`${dream.id}-tag-${index}`}>{tag.value}</span>
                    ))}
                  </div>
                ) : null}
                {isOwner && (
                  <button type="button" className="ghost-btn" onClick={() => {
                    setEditingContent(true);
                    setContentInput(dream.content || '');
                    setEditableTags(Array.isArray(dream.tags) ? dream.tags : []);
                  }}>
                    Edit content
                  </button>
                )}
              </>
            )}
          </div>

        <div className="activity-reactions detail-reactions" aria-label="Dream reactions">
          <div className="reaction-buttons">
            <button
              type="button"
              className={`reaction-button${reactionSnapshot.viewerReaction === DEFAULT_REACTION ? ' active' : ''}`}
              onClick={() => handleDreamReactionSelection(DEFAULT_REACTION)}
              aria-label="React with a heart"
            >
              <FontAwesomeIcon icon={faHeart} className="reaction-icon" />
              <span className="reaction-count">{reactionSnapshot.counts?.[DEFAULT_REACTION] || 0}</span>
            </button>
            <button
              type="button"
              className="reaction-button custom-emoji-trigger"
              onClick={openCustomEmojiPicker}
              aria-label="Add a custom emoji reaction"
            >
              <FontAwesomeIcon icon={faPlus} className="reaction-icon" />
              <span className="reaction-count">Emoji</span>
            </button>
            <button
              type="button"
              className="reaction-button clear-reaction"
              disabled={!reactionSnapshot.viewerReaction}
              onClick={() => handleDreamReactionSelection(null)}
            >
              Clear
            </button>
          </div>
          {customEmojiPickerOpen && (
            <form className="custom-emoji-popover" onSubmit={handleCustomEmojiSubmit}>
              <input
                type="text"
                inputMode="text"
                maxLength={4}
                value={customEmojiValue}
                onChange={(event) => handleCustomEmojiChange(event.target.value)}
                aria-label="Choose an emoji reaction"
                placeholder="Type an emoji"
                autoFocus
              />
              <button type="submit" className="primary-btn" disabled={!customEmojiValue.trim()}>
                Add
              </button>
              <button type="button" className="ghost-btn" onClick={closeCustomEmojiPicker}>
                Cancel
              </button>
            </form>
          )}
          <span className="reaction-total">
            {totalDreamReactions ? `${totalDreamReactions} reaction${totalDreamReactions === 1 ? '' : 's'}` : 'Be the first to react'}
          </span>
        </div>

        <div className="detail-summary">
            <div>
              <h3>Summary</h3>
              {dream.aiGenerated && dream.aiInsights ? (
                <p className="detail-insight">{dream.aiInsights}</p>
              ) : (
                <p className="detail-insight muted">No summary yet.</p>
              )}
            </div>
            {isOwner && !dream.aiGenerated ? (
              <button
                type="button"
                className="primary-btn"
                onClick={handleAnalyzeDream}
                disabled={analyzing}
              >
                {analyzing ? 'Generating title & summary…' : 'Generate title & summary'}
              </button>
            ) : null}
          </div>

        {isOwner && dream.aiGenerated && dream.aiTitle && dream.aiTitle !== (dream.title || '').trim() ? (
          <div className="ai-title-hint">
            <p className="ai-title-label">AI suggestion: <span>{dream.aiTitle}</span></p>
            <button
              type="button"
              className="ghost-btn"
              onClick={handleApplyAiTitle}
              disabled={applyingAiTitle}
            >
              {applyingAiTitle ? 'Applying…' : 'Use AI title'}
            </button>
          </div>
        ) : null}

        {isOwner && statusMessage && <p className="detail-status-message">{statusMessage}</p>}

        <div className="detail-comments">
          <div className="detail-section-head">
            <p className="detail-label">Comments{commentCountLabel}</p>
          </div>
          {commentsLoading ? (
            <div className="loading-inline">
              <LoadingIndicator label="Loading comments…" size="sm" align="start" />
            </div>
          ) : commentError ? (
            <p className="detail-hint">{commentError}</p>
          ) : commentThreads.length ? (
            <div className="comments-list">
              {commentThreads.map((entry) => renderCommentThread(entry))}
            </div>
          ) : (
            <p className="detail-hint">No comments yet. Be the first to add one.</p>
          )}
          {viewerId ? (
            <div className="comment-composer">
              {replyTarget && (
                <div className="reply-context">
                  <span>
                    Replying to {replyTarget.authorUsername ? `@${replyTarget.authorUsername}` : replyTarget.authorDisplayName}
                  </span>
                  <button type="button" onClick={clearReplyTarget}>
                    Cancel
                  </button>
                </div>
              )}
              <textarea
                ref={commentInputRef}
                placeholder="Add a thoughtful note"
                value={commentInput}
                onChange={(e) => {
                  setCommentInput(e.target.value);
                  if (commentStatus) {
                    setCommentStatus('');
                  }
                }}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    handleSubmitComment();
                  }
                }}
              />
              <div className="comment-composer-actions">
                <button
                  type="button"
                  className="primary-btn"
                  onClick={handleSubmitComment}
                  disabled={commentBusy || !commentInput.trim()}
                >
                  {commentBusy ? 'Posting…' : 'Post comment'}
                </button>
              </div>
              {commentStatus && <p className="detail-hint composer-status">{commentStatus}</p>}
            </div>
          ) : (
            <p className="detail-hint">Sign in to add your take.</p>
          )}
        </div>

        {isOwner && (
          <div className="detail-share-accordion">
            <button
              type="button"
              className="detail-share-toggle"
              onClick={() => setSharingControlsOpen((prev) => !prev)}
              aria-expanded={sharingControlsOpen}
            >
              <div>
                <p className="detail-label">Sharing options</p>
                <p className="detail-hint">{visibilitySummary}</p>
              </div>
              <span className={`share-toggle-icon${sharingControlsOpen ? ' open' : ''}`} aria-hidden="true">›</span>
            </button>
            {sharingControlsOpen && (
              <div className="detail-share-panel">
                <div className="detail-visibility">
                  <p className="detail-label">Visibility</p>
                  <div className="detail-visibility-options">
                    {VISIBILITY_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={(dream.visibility === option.value || (option.value === 'following' && dream.visibility === 'followers')) ? 'pill pill-active' : 'pill'}
                        onClick={() => handleVisibilityChange(option.value)}
                        disabled={updatingVisibility}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {dream.visibility !== 'private' && (
                  <div className="detail-audience">
                    <div className="detail-section-head">
                      <p className="detail-label">Hide from specific people</p>
                      <p className="detail-hint">Search your following to keep certain dreamers from seeing this entry.</p>
                    </div>
                    {audienceLoading ? (
                      <div className="loading-inline">
                        <LoadingIndicator label="Loading your following…" size="sm" align="start" />
                      </div>
                    ) : audienceOptions.length === 0 ? (
                      <p className="detail-hint">Follow people to curate this list.</p>
                    ) : (
                      <>
                        <div className="audience-search-input">
                          <input
                            type="text"
                            placeholder="Search your following"
                            value={audienceQuery}
                            onChange={(e) => setAudienceQuery(e.target.value)}
                          />
                        </div>
                        {!hasAudienceQuery ? (
                          <p className="detail-hint">Start typing to search your following.</p>
                        ) : (
                          <div className="audience-result-list">
                            {filteredAudience.length ? (
                              filteredAudience.map((profile) => {
                                const isHidden = excludedViewerIds.includes(profile.id);
                                return (
                                  <button
                                    key={profile.id}
                                    type="button"
                                    className={`audience-result${isHidden ? ' active' : ''}`}
                                    onClick={() => handleToggleAudience(profile.id)}
                                    disabled={audienceBusy}
                                  >
                                    <div className="audience-result-meta">
                                      <span className="result-name">{profile.displayName}</span>
                                      {profile.username && <span className="result-handle">@{profile.username}</span>}
                                    </div>
                                    <span className="result-status">{isHidden ? 'Hidden' : 'Visible'}</span>
                                  </button>
                                );
                              })
                            ) : (
                              <p className="detail-hint">No matches for "{audienceQuery}".</p>
                            )}
                          </div>
                        )}
                        {excludedViewerIds.length > 0 && (
                          <div className="selected-pill-row">
                            {excludedViewerIds.map((id) => {
                              const profile = audienceLookup[id];
                              const label = profile?.username ? `@${profile.username}` : profile?.displayName || 'Dreamer';
                              return (
                                <span key={id} className="selected-pill">
                                  {label}
                                  <button
                                    type="button"
                                    onClick={() => handleToggleAudience(id)}
                                    aria-label={`Remove ${label}`}
                                    disabled={audienceBusy}
                                  >
                                    ×
                                  </button>
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </>
                    )}
                    {audienceBusy && <p className="detail-hint">Updating…</p>}
                  </div>
                )}

                <div className="detail-tagged">
                  <p className="detail-label">Tag people</p>
                  <div className="tag-people-input">
                    <input
                      type="text"
                      placeholder="@username"
                      value={tagHandle}
                      onChange={(e) => {
                        setTagHandle(e.target.value);
                        setTaggingStatus('');
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddTaggedPerson();
                        }
                      }}
                    />
                    <button type="button" className="add-tag-btn" onClick={handleAddTaggedPerson} disabled={taggingBusy || !tagHandle.trim()}>
                      {taggingBusy ? 'Tagging…' : 'Tag'}
                    </button>
                  </div>
                  {tagSuggestions.length > 0 && (
                    <div className="tag-suggestion-list">
                      {tagSuggestions.map((profile) => (
                        <button
                          type="button"
                          key={profile.id}
                          className="tag-suggestion-item"
                          onClick={() => handleSelectTagSuggestion(profile)}
                          disabled={taggingBusy}
                        >
                          <span className="suggestion-name">{profile.displayName}</span>
                          {profile.username && <span className="suggestion-username">@{profile.username}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  {taggingStatus && <p className="detail-hint">{taggingStatus}</p>}
                  {taggedPeople.length ? (
                    <div className="tagged-pill-row">
                      {taggedPeople.map((entry) => (
                        <span key={entry.userId} className="tagged-pill">
                          @{entry.username || entry.displayName}
                          <button type="button" aria-label={`Remove ${entry.username || entry.displayName}`} onClick={() => handleRemoveTaggedPerson(entry.userId)} disabled={taggingBusy}>
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="detail-hint">Tagged dreamers will see this on their profile.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="detail-actions">
          <button type="button" className="secondary-btn" onClick={goBack}>
            Close
          </button>
          {isOwner && (
            <button
              type="button"
              className="danger-btn"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Deleting…' : 'Delete dream'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
