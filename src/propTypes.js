import PropTypes from 'prop-types';

export const firebaseUserPropType = PropTypes.shape({
  uid: PropTypes.string,
  displayName: PropTypes.string,
  email: PropTypes.string,
  username: PropTypes.string,
  handle: PropTypes.string,
  getIdToken: PropTypes.func
});

const activityEntryShape = PropTypes.shape({
  id: PropTypes.string,
  type: PropTypes.string,
  dreamId: PropTypes.string,
  dreamOwnerId: PropTypes.string,
  dreamOwnerUsername: PropTypes.string,
  actorId: PropTypes.string,
  actorUsername: PropTypes.string,
  actorDisplayName: PropTypes.string,
  createdAt: PropTypes.instanceOf(Date),
  read: PropTypes.bool
});

const followingUpdateShape = PropTypes.shape({
  id: PropTypes.string,
  userId: PropTypes.string,
  ownerProfile: PropTypes.shape({
    id: PropTypes.string,
    displayName: PropTypes.string,
    username: PropTypes.string
  }),
  createdAt: PropTypes.instanceOf(Date),
  updatedAt: PropTypes.instanceOf(Date)
});

export const activityPreviewPropType = PropTypes.shape({
  inboxEntries: PropTypes.arrayOf(activityEntryShape),
  inboxLoading: PropTypes.bool,
  inboxError: PropTypes.string,
  unreadActivityCount: PropTypes.number,
  hasUnreadActivity: PropTypes.bool,
  followingUpdates: PropTypes.arrayOf(followingUpdateShape),
  latestFollowingTimestamp: PropTypes.number
});
