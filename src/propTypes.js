import PropTypes from 'prop-types';

export const firebaseUserPropType = PropTypes.shape({
  uid: PropTypes.string,
  displayName: PropTypes.string,
  email: PropTypes.string,
  username: PropTypes.string,
  getIdToken: PropTypes.func
});

export const activityPreviewPropType = PropTypes.shape({
  inboxEntries: PropTypes.array,
  inboxLoading: PropTypes.bool,
  inboxError: PropTypes.string,
  unreadActivityCount: PropTypes.number,
  hasUnreadActivity: PropTypes.bool,
  followingUpdates: PropTypes.array,
  latestFollowingTimestamp: PropTypes.number,
  feedSeenAt: PropTypes.number
});
