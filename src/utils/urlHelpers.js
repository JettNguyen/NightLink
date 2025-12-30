const sanitizeUsername = (value) => {
  if (!value) return '';
  return value.trim().toLowerCase();
};

export const buildProfilePath = (username, userId) => {
  const slug = sanitizeUsername(username) || userId;
  return slug ? `/profile/${slug}` : '/profile';
};

export const buildDreamPath = (username, userId, dreamId) => {
  const profilePath = buildProfilePath(username, userId);
  return dreamId ? `${profilePath}/dream/${dreamId}` : profilePath;
};
