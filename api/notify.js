const admin = require('firebase-admin');

const ALLOWED_ACTIVITY_TYPES = new Set(['reaction', 'commentReaction']);
const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token'
]);

const setCors = (res, origin) => {
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Max-Age', '86400');
};

const parseJson = (body) => {
  if (!body) return {};
  if (typeof body !== 'string') return body;
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
};

const buildServiceAccountConfig = () => {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      if (parsed.private_key) {
        parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
      }
      return parsed;
    } catch {
      return null;
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  return {
    projectId,
    clientEmail,
    privateKey: privateKey.replace(/\\n/g, '\n')
  };
};

const getAdminApp = () => {
  if (admin.apps.length) {
    return admin.app();
  }

  const serviceAccount = buildServiceAccountConfig();
  if (!serviceAccount) {
    throw new Error('Missing Firebase admin credentials');
  }

  return admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
};

const extractAuthToken = (req) => {
  const header = req.headers?.authorization || '';
  if (!header.toLowerCase().startsWith('bearer ')) {
    return null;
  }
  return header.slice(7).trim();
};

const normalizeString = (value, fallback = '') => (
  typeof value === 'string' && value.trim().length ? value.trim() : fallback
);

const buildNotification = (payload) => {
  const actorName = normalizeString(payload.actorDisplayName, 'Someone');
  const dreamTitle = normalizeString(payload.dreamTitleSnapshot, 'Dream update');

  if (payload.type === 'reaction') {
    const emoji = normalizeString(payload.emoji, '💙');
    return {
      title: `${actorName} reacted to your dream`,
      body: `${emoji} ${dreamTitle}`
    };
  }

  if (payload.type === 'commentReaction') {
    return {
      title: `${actorName} liked your comment`,
      body: dreamTitle
    };
  }

  return null;
};

const buildDataPayload = (payload) => ({
  type: normalizeString(payload.type, ''),
  dreamId: normalizeString(payload.dreamId, ''),
  commentId: normalizeString(payload.commentId, ''),
  actorId: normalizeString(payload.actorId, ''),
  actorUsername: normalizeString(payload.actorUsername, ''),
  emoji: normalizeString(payload.emoji, ''),
  dreamTitle: normalizeString(payload.dreamTitleSnapshot, ''),
  timestamp: Date.now().toString()
});

const filterTokens = (rawTokens) => {
  if (!Array.isArray(rawTokens)) return [];
  const seen = new Set();
  const filtered = [];
  for (const token of rawTokens) {
    if (typeof token !== 'string') continue;
    const trimmed = token.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    filtered.push(trimmed);
    if (filtered.length >= 500) break;
  }
  return filtered;
};

module.exports = async function handler(req, res) {
  setCors(res, req.headers?.origin);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const idToken = extractAuthToken(req);
  if (!idToken) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  const body = parseJson(req.body);
  const targetUserId = normalizeString(body.targetUserId, null);
  const payload = body.payload && typeof body.payload === 'object' ? body.payload : null;

  if (!targetUserId || !payload) {
    return res.status(400).json({ error: 'Missing targetUserId or payload' });
  }

  if (!ALLOWED_ACTIVITY_TYPES.has(payload.type)) {
    return res.status(400).json({ error: 'Unsupported activity type' });
  }

  let app;
  try {
    app = getAdminApp();
  } catch (error) {
    console.error('Admin init failed', error);
    return res.status(500).json({ error: 'Push service not configured' });
  }

  let decoded;
  try {
    decoded = await admin.auth(app).verifyIdToken(idToken);
  } catch (error) {
    return res.status(401).json({ error: 'Invalid auth token' });
  }

  if (!decoded?.uid || decoded.uid !== payload.actorId) {
    return res.status(403).json({ error: 'Actor mismatch' });
  }

  if (targetUserId === payload.actorId) {
    return res.status(200).json({ skipped: true, reason: 'self-target' });
  }

  const firestore = admin.firestore(app);
  const targetRef = firestore.collection('users').doc(targetUserId);
  const snap = await targetRef.get();

  if (!snap.exists) {
    return res.status(404).json({ error: 'Target user not found' });
  }

  const userData = snap.data() || {};
  const tokens = filterTokens(userData.fcmTokens);

  if (!tokens.length) {
    return res.status(200).json({ skipped: true, reason: 'no-tokens' });
  }

  const notificationsDisabled = userData.notificationsEnabled === false
    || userData.settings?.notificationsEnabled === false;
  const alertsDisabled = userData.settings?.notifyActivityAlerts === false;

  if (notificationsDisabled || alertsDisabled) {
    return res.status(200).json({ skipped: true, reason: 'opted-out' });
  }

  const notification = buildNotification(payload);
  if (!notification) {
    return res.status(400).json({ error: 'Unable to build notification content' });
  }

  const message = {
    tokens,
    notification,
    data: buildDataPayload(payload),
    webpush: {
      headers: { TTL: '1800' },
      notification: {
        icon: '/favicon.svg',
        badge: '/favicon.svg',
        tag: `activity-${payload.type}-${payload.dreamId || Date.now()}`
      }
    }
  };

  let response;
  try {
    response = await admin.messaging(app).sendEachForMulticast(message);
  } catch (error) {
    console.error('FCM send failed', error);
    return res.status(502).json({ error: 'Notification send failed' });
  }

  const invalidTokens = [];
  response.responses.forEach((r, index) => {
    if (r.success) return;
    const code = r.error?.code;
    if (code && INVALID_TOKEN_CODES.has(code)) {
      invalidTokens.push(tokens[index]);
    }
  });

  if (invalidTokens.length) {
    try {
      await targetRef.update({
        fcmTokens: admin.firestore.FieldValue.arrayRemove(...invalidTokens)
      });
    } catch (error) {
      console.warn('Failed to prune invalid tokens', error);
    }
  }

  return res.status(200).json({
    successCount: response.successCount,
    failureCount: response.failureCount,
    invalidated: invalidTokens.length
  });
};
