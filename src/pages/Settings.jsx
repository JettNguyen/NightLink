import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { EmailAuthProvider, linkWithCredential, updatePassword } from 'firebase/auth';
import { auth, db } from '../firebase';
import LoadingIndicator from '../components/LoadingIndicator';
import { firebaseUserPropType } from '../propTypes';
import { areNotificationsSupported, disableNotifications, getNotificationPermission, requestNotificationPermission } from '../utils/notificationHelpers';
import './Settings.css';

const DEFAULT_SETTINGS = {
  aiPromptPreset: 'balanced',
  aiPromptCustom: '',
  notificationsEnabled: false,
  notifyDreamReminders: true,
  notifyFeedUpdates: true,
  notifyActivityAlerts: true
};

const PROMPT_PRESETS = [
  {
    id: 'balanced',
    title: 'Balanced Guide',
    description: 'Mix meaningful symbols with grounded actions you can take today.'
  },
  {
    id: 'coach',
    title: 'Sleep Coach',
    description: 'Focus on rest quality, stress signals, and calming bedtime rituals.'
  },
  {
    id: 'therapist',
    title: 'Comfort AI',
    description: 'Gentle reassurance for nightmares with grounded reminders that you\'re safe.'
  },
  {
    id: 'scientist',
    title: 'Brain Scientist',
    description: 'Neuroscience-backed explanations of REM sleep and memory processing.'
  },
  {
    id: 'mystical',
    title: 'Mystic Oracle',
    description: 'Poetic interpretations with archetypal wisdom and spiritual vibes.'
  },
  {
    id: 'creative',
    title: 'Story Weaver',
    description: 'Turn your dream into a narrative seed for writing or worldbuilding.'
  },
  {
    id: 'director',
    title: 'Movie Director',
    description: 'One paragraph film treatment of your dream. Bold, cinematic, occasionally chaotic.'
  },
  {
    id: 'comedian',
    title: 'Dream Comedian',
    description: 'Light-hearted, humorous takes on the absurdity of your subconscious.'
  },
  {
    id: 'custom',
    title: 'Custom',
    description: 'Write your own instructions for exactly how insights should feel.'
  }
];

const PROMPT_TEMPLATES = {
  balanced: 'You\'re here to break down dreams in a way that actually helps. Pick out 1-2 symbols that stand out and explain what they might mean, then drop a reflection question and one small thing they can actually do about it. Keep it real and useful—3-6 sentences max. Be warm but don\'t overcomplicate it.',
  coach: 'You\'re checking this dream for stress signals and how their sleep\'s actually doing. Point out anything that screams anxiety, burnout, or restlessness, then suggest one thing they can try tonight to sleep better. 3-6 sentences. Keep it practical and supportive, not preachy.',
  therapist: 'You\'re a gentle comfort AI for someone who just woke from a nightmare. Reassure them that the dream isn\'t real, validate the feelings it stirred up, and point to one hopeful takeaway or grounding reminder from the imagery. Offer 3-6 sentences that blend insight with soothing language so they leave calmer than they arrived.',
  scientist: 'You\'re breaking down the neuroscience behind this dream—REM sleep, memory consolidation, emotional processing, all that. Explain why their brain cooked up this scenario in a way that actually makes sense. 3-6 sentences. Be smart but don\'t make it feel like a textbook.',
  mystical: 'You\'re reading this dream through a spiritual lens, tapping into archetypes and universal symbols like the moon, shadows, journeys, rebirth. Use poetic language and pull out the deeper meaning or soul lesson they need to hear. 3-6 sentences. Be mystical and intentional, not vague.',
  creative: 'You\'re helping turn their dream into story material. Point out the wildest or most vivid parts, suggest how it could work as a plot, character arc, or worldbuilding element, and keep them grounded while firing up their creativity. 3-6 sentences. Be inspiring without being extra.',
  director: 'You\'re an auteur movie director retelling this dream as a film pitch. Describe the opening shot, key set pieces, tone, and how you\'d translate the dream\'s message to the screen. It should feel like one vivid paragraph—bold, cinematic, occasionally unhinged but still coherent enough to spark the dreamer\'s imagination.',
  comedian: 'You\'re finding the humor in how absurd dreams can get. Roast the weirdest parts with some playful commentary, but still acknowledge the real feelings underneath. 3-6 sentences. Be funny in a way that lands—warm and clever, not trying too hard.',
  custom: ''
};

const PROMPT_ID_ALIASES = {
  investigator: 'director'
};

const normalizePresetId = (id) => (
  PROMPT_ID_ALIASES[id] || id || 'balanced'
);

const BLOCKED_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above|earlier)/i,
  /disregard\s+(all\s+)?(previous|prior|instructions|rules)/i,
  /forget\s+(everything|all|your|the)/i,
  /new\s+instructions?:/i,
  /system\s*:/i,
  /\bact\s+as\s+(a\s+)?(terminal|admin|root)/i,
  /execute\s+(code|command|script)/i,
  /\beval\s*\(/i,
  /\bexec\s*\(/i,
  /pretend\s+you('re|\s+are)\s+(not|no\s+longer)/i,
  /you\s+are\s+now\s+(?!a\s+dream)/i,
  /jailbreak/i,
  /bypass\s+(your|the|all)/i,
  /override\s+(your|the|all)/i,
  /(write|generate|make)\s+(longer|more|extended)/i,
  /(longer|extended|detailed)\s+(output|response|paragraph)/i,
  /no\s+(limit|restriction|constraint)/i,
  /(remove|lift|disable)\s+(the\s+)?(limit|restriction|constraint)/i,
  /as\s+many\s+(sentences|words|paragraphs)/i,
  /(unlimited|infinite|maximum)\s+(length|output)/i,
  /\d+\s+(sentences|paragraphs|words)\s+(or\s+more|minimum)/i
];

const MAX_PROMPT_LENGTH = 400;

const sanitizePrompt = (raw) => {
  if (!raw || typeof raw !== 'string') return '';
  
  let clean = raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_PROMPT_LENGTH);
  
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(clean)) {
      return '';
    }
  }
  
  return clean;
};

const isPromptSafe = (text) => {
  if (!text || typeof text !== 'string') return true;
  return !BLOCKED_PATTERNS.some((p) => p.test(text));
};

function Toggle({ checked, onChange, id, disabled }) {
  return (
    <label className={`toggle-switch${disabled ? ' is-disabled' : ''}`} htmlFor={id}>
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
      />
      <span className="toggle-track" />
    </label>
  );
}

Toggle.propTypes = {
  checked: PropTypes.bool.isRequired,
  onChange: PropTypes.func.isRequired,
  id: PropTypes.string.isRequired,
  disabled: PropTypes.bool
};

Toggle.defaultProps = {
  disabled: false
};

export default function Settings({ user }) {
  const [profile, setProfile] = useState(null);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [notificationsSupported, setNotificationsSupported] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState(() => getNotificationPermission());
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState('');
  const [hasPasswordLogin, setHasPasswordLogin] = useState(() => (
    user?.providerData?.some((p) => p.providerId === 'password') ?? false
  ));
  const [passwordForm, setPasswordForm] = useState({ newPassword: '', confirmPassword: '' });
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordStatus, setPasswordStatus] = useState('');
  const savedRef = useRef(JSON.stringify(DEFAULT_SETTINGS));

  const uid = user?.uid || null;

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return undefined;
    }

    const ref = doc(db, 'users', uid);
    const unsubscribe = onSnapshot(ref, (snapshot) => {
      setLoading(false);
      if (!snapshot.exists()) {
        setProfile(null);
        savedRef.current = JSON.stringify(DEFAULT_SETTINGS);
        setSettings(DEFAULT_SETTINGS);
        return;
      }

      const data = snapshot.data() || {};
      setProfile(data);

      const incoming = data.settings || {};
      const merged = {
        ...DEFAULT_SETTINGS,
        ...incoming,
        aiPromptPreset: incoming.aiPromptPreset || data.aiPromptPreference?.preset || 'balanced',
        aiPromptCustom: incoming.aiPromptCustom ?? data.aiPromptPreference?.customPrompt ?? ''
      };

      merged.aiPromptPreset = normalizePresetId(merged.aiPromptPreset);

      if (incoming.notifyReactions !== undefined && incoming.notifyActivityAlerts === undefined) {
        merged.notifyActivityAlerts = incoming.notifyReactions;
      }

      savedRef.current = JSON.stringify(merged);
      setSettings(merged);
    }, () => {
      setLoading(false);
    });

    return () => unsubscribe();
  }, [uid]);

  useEffect(() => {
    setNotificationsSupported(areNotificationsSupported());
    setNotificationPermission(getNotificationPermission());
  }, []);

  useEffect(() => {
    setHasPasswordLogin(user?.providerData?.some((p) => p.providerId === 'password') ?? false);
  }, [user]);

  useEffect(() => {
    if (!status) return undefined;
    const t = setTimeout(() => setStatus(''), 3000);
    return () => clearTimeout(t);
  }, [status]);

  useEffect(() => {
    if (!notificationMessage) return undefined;
    const t = setTimeout(() => setNotificationMessage(''), 4000);
    return () => clearTimeout(t);
  }, [notificationMessage]);

  useEffect(() => {
    if (!passwordStatus) return undefined;
    const t = setTimeout(() => setPasswordStatus(''), 4000);
    return () => clearTimeout(t);
  }, [passwordStatus]);

  const [promptError, setPromptError] = useState('');

  const hasChanges = useMemo(() => (
    JSON.stringify(settings) !== savedRef.current
  ), [settings]);

  const update = useCallback((key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const toggle = (key) => update(key, !settings[key]);

  const selectPreset = (id) => {
    update('aiPromptPreset', normalizePresetId(id));
  };

  const handleCustomPromptChange = (value) => {
    const trimmed = value.slice(0, MAX_PROMPT_LENGTH);
    update('aiPromptCustom', trimmed);
    
    if (!isPromptSafe(trimmed)) {
      setPromptError('This prompt contains blocked phrases. Please revise.');
    } else {
      setPromptError('');
    }
  };

  const handlePasswordField = (key, value) => {
    setPasswordForm((prev) => ({ ...prev, [key]: value }));
    setPasswordError('');
  };

  const handleNotificationsToggle = useCallback(async () => {
    if (!uid || notificationBusy) return;
    if (!notificationsSupported) {
      setNotificationMessage('Push notifications are not supported in this browser.');
      return;
    }

    setNotificationBusy(true);
    setNotificationMessage('');

    try {
      if (!settings.notificationsEnabled) {
        const token = await requestNotificationPermission(uid);
        const permission = getNotificationPermission();
        setNotificationPermission(permission);
        if (token) {
          update('notificationsEnabled', true);
          setNotificationMessage('Notifications enabled for this device.');
        } else if (permission === 'denied') {
          setNotificationMessage('Permission blocked. Enable notifications in your browser settings to continue.');
        } else {
          setNotificationMessage('Could not enable notifications. Please try again.');
        }
      } else {
        await disableNotifications(uid);
        update('notificationsEnabled', false);
        setNotificationPermission(getNotificationPermission());
        setNotificationMessage('Notifications disabled for this device.');
      }
    } catch (error) {
      console.error('Notification toggle failed', error);
      setNotificationMessage('Something went wrong while updating notifications.');
    } finally {
      setNotificationBusy(false);
    }
  }, [uid, notificationBusy, notificationsSupported, settings.notificationsEnabled, update]);

  const passwordRequirementsMet = useMemo(() => {
    const next = passwordForm.newPassword.trim();
    if (next.length < 8) return false;
    return next === passwordForm.confirmPassword.trim();
  }, [passwordForm.newPassword, passwordForm.confirmPassword]);

  const handlePasswordSave = useCallback(async () => {
    if (!auth.currentUser?.email) {
      setPasswordError('This account is missing an email, so password login cannot be enabled.');
      return;
    }
    const next = passwordForm.newPassword.trim();
    const confirm = passwordForm.confirmPassword.trim();

    if (next.length < 8) {
      setPasswordError('Use at least 8 characters for your password.');
      return;
    }
    if (next !== confirm) {
      setPasswordError('Passwords do not match.');
      return;
    }

    setPasswordBusy(true);
    setPasswordError('');
    setPasswordStatus('');
    try {
      if (hasPasswordLogin) {
        await updatePassword(auth.currentUser, next);
      } else {
        const credential = EmailAuthProvider.credential(auth.currentUser.email, next);
        await linkWithCredential(auth.currentUser, credential);
        setHasPasswordLogin(true);
      }
      await auth.currentUser?.reload();
      setPasswordStatus('Password saved. You can now sign in with your email or username again.');
      setPasswordForm({ newPassword: '', confirmPassword: '' });
    } catch (error) {
      if (error.code === 'auth/requires-recent-login') {
        setPasswordError('Please sign in again (e.g., with Google) and then retry updating the password.');
      } else {
        setPasswordError(error.message || 'Failed to update password.');
      }
    } finally {
      setPasswordBusy(false);
    }
  }, [passwordForm, hasPasswordLogin]);

  const notificationPermissionLabel = useMemo(() => {
    if (notificationPermission === 'granted') return 'Permission granted';
    if (notificationPermission === 'denied') return 'Permission blocked';
    return 'Permission pending';
  }, [notificationPermission]);

  const resolvedPrompt = useMemo(() => {
    if (settings.aiPromptPreset === 'custom') {
      const sanitized = sanitizePrompt(settings.aiPromptCustom);
      return sanitized || 'Describe the insight style you want…';
    }
    const presetId = normalizePresetId(settings.aiPromptPreset);
    return PROMPT_TEMPLATES[presetId] || PROMPT_TEMPLATES.balanced;
  }, [settings.aiPromptPreset, settings.aiPromptCustom]);

  const canSave = useMemo(() => {
    if (!hasChanges) return false;
    if (settings.aiPromptPreset === 'custom' && !isPromptSafe(settings.aiPromptCustom)) {
      return false;
    }
    return true;
  }, [hasChanges, settings.aiPromptPreset, settings.aiPromptCustom]);

  const handleSave = async () => {
    if (!uid || saving || !canSave) return;
    setSaving(true);
    setStatus('');

    const sanitizedCustom = sanitizePrompt(settings.aiPromptCustom);
    const presetId = normalizePresetId(settings.aiPromptPreset);
    const usingCustom = presetId === 'custom';
    const promptText = usingCustom
      ? sanitizedCustom
      : PROMPT_TEMPLATES[presetId] || PROMPT_TEMPLATES.balanced;

    const payload = {
      settings: {
        ...settings,
        aiPromptPreset: presetId,
        aiPromptCustom: usingCustom ? sanitizedCustom : ''
      },
      aiPromptPreference: {
        preset: presetId,
        customPrompt: usingCustom ? sanitizedCustom : '',
        prompt: promptText,
        updatedAt: serverTimestamp()
      },
      settingsUpdatedAt: serverTimestamp()
    };

    try {
      await updateDoc(doc(db, 'users', uid), payload);
      savedRef.current = JSON.stringify({
        ...settings,
        aiPromptPreset: presetId,
        aiPromptCustom: usingCustom ? settings.aiPromptCustom : ''
      });
      setStatus('saved');
    } catch (err) {
      console.error('Settings save failed', err);
      setStatus('error');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setSettings(DEFAULT_SETTINGS);
  };

  if (!uid) {
    return (
      <div className="page-container settings-page">
        <div className="settings-section">
          <div className="settings-section-body" style={{ textAlign: 'center', padding: '2rem' }}>
            <h2>Sign in required</h2>
            <p style={{ color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
              You need to be logged in to manage your settings.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container settings-page">
      <header className="settings-header">
        <h1>Settings</h1>
        <p>Customize your experience.</p>
      </header>

      <div className="settings-save-bar">
        <p>{hasChanges ? 'You have unsaved changes' : 'All changes saved'}</p>
        <div className="btn-group">
          {status === 'saved' && <span className="settings-status success">Saved</span>}
          {status === 'error' && <span className="settings-status error">Failed</span>}
          <button type="button" className="ghost-btn" onClick={handleReset} disabled={saving}>
            Reset
          </button>
          <button
            type="button"
            className="primary-btn"
            onClick={handleSave}
            disabled={!canSave || saving}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="settings-loading-state">
          <LoadingIndicator label="Loading preferences…" />
        </div>
      ) : (
        <div className="settings-sections">
          <section className="settings-section">
            <div className="settings-section-head">
              <h2>AI insight style</h2>
              <p>Choose how NightLink interprets and responds to your dreams.</p>
            </div>
            <div className="settings-section-body">
              <div className="prompt-options">
                {PROMPT_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className={`prompt-option${settings.aiPromptPreset === preset.id ? ' selected' : ''}`}
                    onClick={() => selectPreset(preset.id)}
                  >
                    <h3>{preset.title}</h3>
                    <p>{preset.description}</p>
                  </button>
                ))}
              </div>

              {settings.aiPromptPreset === 'custom' && (
                <div className="custom-prompt-area">
                  <label htmlFor="customPrompt">Your custom instructions</label>
                  <textarea
                    id="customPrompt"
                    value={settings.aiPromptCustom}
                    onChange={(e) => handleCustomPromptChange(e.target.value)}
                    maxLength={MAX_PROMPT_LENGTH}
                    placeholder="E.g. Act like a Jungian analyst who references mythology and gives one concrete journaling prompt at the end."
                  />
                  {promptError && (
                    <p className="prompt-error">{promptError}</p>
                  )}
                  <div className="custom-prompt-footer">
                    {MAX_PROMPT_LENGTH - (settings.aiPromptCustom?.length || 0)} characters remaining
                  </div>
                </div>
              )}

              <div className="prompt-preview-box">
                <p className="preview-label">Active prompt</p>
                <p className="preview-text">{resolvedPrompt}</p>
              </div>
            </div>
          </section>

          <section className="settings-section">
            <div className="settings-section-head">
              <h2>Notifications</h2>
              <p>Stay in the loop with morning reminders, feed drops, and activity alerts.</p>
            </div>
            <div className="settings-section-body">
              <div className="notification-support">
                <span className={`notification-chip${notificationsSupported ? ' success' : ' warn'}`}>
                  {notificationsSupported ? 'Browser supports push' : 'Push not supported'}
                </span>
                <span className={`notification-chip${notificationPermission === 'granted' ? ' success' : notificationPermission === 'denied' ? ' warn' : ''}`}>
                  {notificationPermissionLabel}
                </span>
              </div>

              {!notificationsSupported && (
                <p className="notification-hint">Push notifications require a modern browser with Service Worker support.</p>
              )}

              <div className="toggle-row">
                <div className="toggle-label">
                  <strong>Push notifications</strong>
                  <span>Receive updates even when NightLink is closed.</span>
                </div>
                <Toggle
                  id="notificationsEnabled"
                  checked={settings.notificationsEnabled}
                  onChange={handleNotificationsToggle}
                  disabled={!notificationsSupported || notificationBusy}
                />
              </div>

              <div className="toggle-row">
                <div className="toggle-label">
                  <strong>Dream reminders</strong>
                  <span>Morning nudges to capture your dream journal while it&apos;s fresh.</span>
                </div>
                <Toggle
                  id="notifyDreamReminders"
                  checked={settings.notifyDreamReminders}
                  onChange={() => toggle('notifyDreamReminders')}
                  disabled={!settings.notificationsEnabled}
                />
              </div>

              <div className="toggle-row">
                <div className="toggle-label">
                  <strong>New feed drops</strong>
                  <span>Alerts when people you follow share new dreams or journal entries.</span>
                </div>
                <Toggle
                  id="notifyFeedUpdates"
                  checked={settings.notifyFeedUpdates}
                  onChange={() => toggle('notifyFeedUpdates')}
                  disabled={!settings.notificationsEnabled}
                />
              </div>

              <div className="toggle-row">
                <div className="toggle-label">
                  <strong>Activity alerts</strong>
                  <span>Followers, comments, and reactions—AI insights are never pushed.</span>
                </div>
                <Toggle
                  id="notifyActivityAlerts"
                  checked={settings.notifyActivityAlerts}
                  onChange={() => toggle('notifyActivityAlerts')}
                  disabled={!settings.notificationsEnabled}
                />
              </div>

              {notificationMessage && (
                <p className="notification-alert">{notificationMessage}</p>
              )}
            </div>
          </section>

          <section className="settings-section">
            <div className="settings-section-head">
              <h2>Account access</h2>
              <p>Keep Google sign-in and password login in sync.</p>
            </div>
            <div className="settings-section-body">
              <p className="password-helper">
                {hasPasswordLogin
                  ? 'Password login is currently enabled. Update it anytime to keep your username/email credentials working.'
                  : 'This account only has Google sign-in enabled. Set a password so you can continue to log in with your email or username.'}
              </p>

              <div className="password-fields">
                <input
                  type="password"
                  placeholder="New password"
                  value={passwordForm.newPassword}
                  onChange={(e) => handlePasswordField('newPassword', e.target.value)}
                  minLength={8}
                  autoComplete="new-password"
                />
                <input
                  type="password"
                  placeholder="Confirm new password"
                  value={passwordForm.confirmPassword}
                  onChange={(e) => handlePasswordField('confirmPassword', e.target.value)}
                  minLength={8}
                  autoComplete="new-password"
                />
              </div>

              <p className="password-hint">Use at least 8 characters. Passwords are stored securely by Firebase Authentication.</p>

              {passwordError && <p className="password-error">{passwordError}</p>}
              {passwordStatus && <p className="password-success">{passwordStatus}</p>}

              <button
                type="button"
                className="primary-btn password-btn"
                onClick={handlePasswordSave}
                disabled={!passwordRequirementsMet || passwordBusy}
              >
                {passwordBusy ? 'Saving…' : hasPasswordLogin ? 'Update password' : 'Enable password login'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

Settings.propTypes = {
  user: firebaseUserPropType
};
