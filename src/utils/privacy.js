export const ACCOUNT_VISIBILITY = {
  PUBLIC: 'public',
  PRIVATE: 'private',
};

export const DREAM_VISIBILITY = {
  PUBLIC: 'public',
  FOLLOWERS: 'followers',
  MUTUALS: 'mutuals',
  PRIVATE: 'private',
  ANONYMOUS: 'anonymous',
};

export const RELATIONSHIP = {
  SELF: 'self',
  MUTUAL: 'mutual',
  FOLLOWER: 'follower',
  PENDING: 'pending',
  NONE: 'none',
};

export const normalizeDreamVisibility = (visibility) => {
  if (visibility === 'following') return DREAM_VISIBILITY.MUTUALS;
  if (visibility === DREAM_VISIBILITY.FOLLOWERS) return DREAM_VISIBILITY.FOLLOWERS;
  if (visibility === DREAM_VISIBILITY.MUTUALS) return DREAM_VISIBILITY.MUTUALS;
  if (visibility === DREAM_VISIBILITY.PUBLIC) return DREAM_VISIBILITY.PUBLIC;
  if (visibility === DREAM_VISIBILITY.ANONYMOUS) return DREAM_VISIBILITY.ANONYMOUS;
  return DREAM_VISIBILITY.PRIVATE;
};

export const normalizeAccountVisibility = (profile) => {
  const raw = profile?.accountVisibility || profile?.settings?.accountVisibility;
  return raw === ACCOUNT_VISIBILITY.PUBLIC ? ACCOUNT_VISIBILITY.PUBLIC : ACCOUNT_VISIBILITY.PRIVATE;
};

export const getViewerRelationshipToOwner = ({
  viewerId,
  ownerId,
  ownerFollowerIds = [],
  ownerFollowingIds = [],
  isPending = false,
}) => {
  if (!viewerId || !ownerId) return RELATIONSHIP.NONE;
  if (viewerId === ownerId) return RELATIONSHIP.SELF;

  const isFollower = ownerFollowerIds.includes(viewerId);
  const isMutual = isFollower && ownerFollowingIds.includes(viewerId);

  if (isMutual) return RELATIONSHIP.MUTUAL;
  if (isFollower) return RELATIONSHIP.FOLLOWER;
  if (isPending) return RELATIONSHIP.PENDING;
  return RELATIONSHIP.NONE;
};

export const canViewerSeeDream = ({
  dream,
  viewerId,
  ownerProfile,
  isPending = false,
}) => {
  if (!dream || !ownerProfile) return false;
  if (dream.userId === viewerId) return true;

  const excludedViewerIds = Array.isArray(dream.excludedViewerIds) ? dream.excludedViewerIds : [];
  if (viewerId && excludedViewerIds.includes(viewerId)) return false;

  const taggedUserIds = Array.isArray(dream.taggedUserIds) ? dream.taggedUserIds : [];
  if (viewerId && taggedUserIds.includes(viewerId)) return true;

  const relationship = getViewerRelationshipToOwner({
    viewerId,
    ownerId: ownerProfile.id,
    ownerFollowerIds: ownerProfile.followerIds || [],
    ownerFollowingIds: ownerProfile.followingIds || [],
    isPending,
  });

  const accountVisibility = normalizeAccountVisibility(ownerProfile);
  const visibility = normalizeDreamVisibility(dream.visibility);

  // Private account gate: only truly public dreams are visible to non-accepted viewers.
  if (accountVisibility === ACCOUNT_VISIBILITY.PRIVATE) {
    if (relationship !== RELATIONSHIP.SELF && relationship !== RELATIONSHIP.FOLLOWER && relationship !== RELATIONSHIP.MUTUAL) {
      return visibility === DREAM_VISIBILITY.PUBLIC || visibility === DREAM_VISIBILITY.ANONYMOUS;
    }
  }

  if (visibility === DREAM_VISIBILITY.PUBLIC || visibility === DREAM_VISIBILITY.ANONYMOUS) return true;
  if (visibility === DREAM_VISIBILITY.PRIVATE) return false;
  if (visibility === DREAM_VISIBILITY.FOLLOWERS) {
    return relationship === RELATIONSHIP.FOLLOWER || relationship === RELATIONSHIP.MUTUAL;
  }
  if (visibility === DREAM_VISIBILITY.MUTUALS) {
    return relationship === RELATIONSHIP.MUTUAL;
  }

  return false;
};
