const clean = (val) => val?.trim().toLowerCase() || '';

export const buildProfilePath = (username, userId) => {
  const slug = clean(username) || userId;
  return slug ? `/profile/${slug}` : '/profile';
};

export const buildDreamPath = (username, userId, dreamId) => {
  const base = buildProfilePath(username, userId);
  return dreamId ? `${base}/dream/${dreamId}` : base;
};
