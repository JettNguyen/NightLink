import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../supabase';
import { mapProfile } from '../utils/mappers';
import LoadingIndicator from '../components/LoadingIndicator';
import { appUserPropType } from '../propTypes';
import { Capacitor } from '@capacitor/core';
import { areNotificationsSupported, disableNotifications, getNotificationPermission, getNotificationPermissionStatus, requestNotificationPermission } from '../utils/notificationHelpers';
import './Settings.css';

const DEFAULT_SETTINGS = {
  aiPromptPreset: 'balanced',
  aiPromptCustom: '',
  notificationsEnabled: false,
  notifyDreamReminders: true,
  notifyFeedUpdates: true,
  notifyActivityAlerts: true
};

const FREE_ALLOWED_PRESETS = new Set(['balanced', 'coach', 'therapist']);
const STRIPE_ENDPOINT = import.meta.env.VITE_STRIPE_ENDPOINT || '/api/stripe';
const PREMIUM_PRICE_ID = import.meta.env.VITE_STRIPE_PREMIUM_PRICE_ID || '';
const CREDIT_PRICE_ID = import.meta.env.VITE_STRIPE_CREDIT_PRICE_ID || '';
const PREMIUM_PAYMENT_LINK = import.meta.env.VITE_STRIPE_PREMIUM_LINK || '';
const CREDIT_PAYMENT_LINK = import.meta.env.VITE_STRIPE_CREDIT_LINK || '';

const PROMPT_PRESETS = [
  { id: 'balanced', title: 'Balanced Guide', description: 'Mix meaningful symbols with grounded actions you can take today.' },
  { id: 'coach', title: 'Sleep Coach', description: 'Focus on rest quality, stress signals, and calming bedtime rituals.' },
  { id: 'therapist', title: 'Comfort AI', description: "Gentle reassurance for nightmares with grounded reminders that you're safe." },
  { id: 'scientist', title: 'Brain Scientist', description: 'Neuroscience-backed explanations of REM sleep and memory processing.' },
  { id: 'mystical', title: 'Mystic Oracle', description: 'Poetic interpretations with archetypal wisdom and spiritual vibes.' },
  { id: 'creative', title: 'Story Weaver', description: 'Turn your dream into a narrative seed for writing or worldbuilding.' },
  { id: 'director', title: 'Movie Director', description: 'One paragraph film treatment of your dream. Bold, cinematic, occasionally chaotic.' },
  { id: 'comedian', title: 'Dream Comedian', description: 'Light-hearted, humorous takes on the absurdity of your subconscious.' },
  { id: 'custom', title: 'Custom', description: 'Write your own instructions for exactly how insights should feel.' }
];

const PROMPT_TEMPLATES = {
  balanced: "You're here to break down dreams in a way that actually helps. Pick out 1-2 symbols that stand out and explain what they might mean, then drop a reflection question and one small thing they can actually do about it. Keep it real and useful-3-6 sentences max. Be warm but don't overcomplicate it.",
  coach: "You're checking this dream for stress signals and how their sleep's actually doing. Point out anything that screams anxiety, burnout, or restlessness, then suggest one thing they can try tonight to sleep better. 3-6 sentences. Keep it practical and supportive, not preachy.",
  therapist: "You're a gentle comfort AI for someone who just woke from a nightmare. Reassure them that the dream isn't real, validate the feelings it stirred up, and point to one hopeful takeaway or grounding reminder from the imagery. Offer 3-6 sentences that blend insight with soothing language so they leave calmer than they arrived.",
  scientist: "You're breaking down the neuroscience behind this dream-REM sleep, memory consolidation, emotional processing, all that. Explain why their brain cooked up this scenario in a way that actually makes sense. 3-6 sentences. Be smart but don't make it feel like a textbook.",
  mystical: "You're reading this dream through a spiritual lens, tapping into archetypes and universal symbols like the moon, shadows, journeys, rebirth. Use poetic language and pull out the deeper meaning or soul lesson they need to hear. 3-6 sentences. Be mystical and intentional, not vague.",
  creative: "You're helping turn their dream into story material. Point out the wildest or most vivid parts, suggest how it could work as a plot, character arc, or worldbuilding element, and keep them grounded while firing up their creativity. 3-6 sentences. Be inspiring without being extra.",
  director: "You're an auteur movie director retelling this dream as a film pitch. Describe the opening shot, key set pieces, tone, and how you'd translate the dream's message to the screen. It should feel like one vivid paragraph-bold, cinematic, occasionally unhinged but still coherent enough to spark the dreamer's imagination.",
  comedian: "You're finding the humor in how absurd dreams can get. Roast the weirdest parts with some playful commentary, but still acknowledge the real feelings underneath. 3-6 sentences. Be funny in a way that lands-warm and clever, not trying too hard.",
  custom: ''
};

const PROMPT_ID_ALIASES = { investigator: 'director' };
const normalizePresetId = (id) => PROMPT_ID_ALIASES[id] || id || 'balanced';

const isPresetLocked = (tier, presetId) => (
  tier !== 'premium' && !FREE_ALLOWED_PRESETS.has(normalizePresetId(presetId))
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

const stripControlChars = (value) => (
  Array.from(value || '')
    .filter((char) => {
      const code = char.charCodeAt(0);
      return !(code <= 31 || (code >= 127 && code <= 159));
    })
    .join('')
);

const sanitizePrompt = (raw) => {
  if (!raw || typeof raw !== 'string') return '';
  let clean = raw
    .split('\n').join(' ');
  clean = stripControlChars(clean)
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_PROMPT_LENGTH);
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(clean)) return '';
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
      <input type="checkbox" id={id} checked={checked} onChange={onChange} disabled={disabled} />
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
    user?.providerData?.some((p) => p.providerId === 'email') ?? false
  ));
  const [passwordForm, setPasswordForm] = useState({ newPassword: '', confirmPassword: '' });
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordStatus, setPasswordStatus] = useState('');
  const [promptError, setPromptError] = useState('');
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [billingStatus, setBillingStatus] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const savedRef = useRef(JSON.stringify(DEFAULT_SETTINGS));
  const uid = user?.uid || null;
  const isNativeIOS = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
  const tier = profile?.subscription?.tier === 'premium' ? 'premium' : 'free';
  const creditBalance = Number(profile?.aiUsage?.creditBalance || 0);
  const currentMonthYear = useMemo(() => new Date().toISOString().slice(0, 7), []);
  const monthlyCount = Number(
    profile?.aiUsage?.monthYear === currentMonthYear
      ? (profile?.aiUsage?.monthlyCount || 0)
      : 0
  );
  const freeRemaining = Math.max(0, 1 - monthlyCount);
  const proRemaining = Math.max(0, 30 - monthlyCount);

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return;
    }

    const fetchProfile = async () => {
      const { data } = await supabase.from('profiles').select('*').eq('id', uid).single();
      setLoading(false);
      if (!data) {
        setProfile(null);
        savedRef.current = JSON.stringify(DEFAULT_SETTINGS);
        setSettings(DEFAULT_SETTINGS);
        return;
      }
      const p = mapProfile(data);
      setProfile(p);
      const incoming = p.settings || {};
      const incomingTier = p?.subscription?.tier === 'premium' ? 'premium' : 'free';
      let normalizedPreset = normalizePresetId(incoming.aiPromptPreset || 'balanced');
      if (isPresetLocked(incomingTier, normalizedPreset)) {
        normalizedPreset = 'balanced';
      }
      const merged = {
        ...DEFAULT_SETTINGS,
        ...incoming,
        aiPromptPreset: normalizedPreset,
        aiPromptCustom: incoming.aiPromptCustom ?? ''
      };
      if (incoming.notifyReactions !== undefined && incoming.notifyActivityAlerts === undefined) {
        merged.notifyActivityAlerts = incoming.notifyReactions;
      }
      savedRef.current = JSON.stringify(merged);
      setSettings(merged);
    };

    fetchProfile();

    const channel = supabase
      .channel(`settings:${uid}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${uid}` },
        (payload) => {
          const p = mapProfile(payload.new);
          setProfile(p);
          const incoming = p.settings || {};
          const incomingTier = p?.subscription?.tier === 'premium' ? 'premium' : 'free';
          let normalizedPreset = normalizePresetId(incoming.aiPromptPreset || 'balanced');
          if (isPresetLocked(incomingTier, normalizedPreset)) {
            normalizedPreset = 'balanced';
          }
          const merged = {
            ...DEFAULT_SETTINGS,
            ...incoming,
            aiPromptPreset: normalizedPreset,
            aiPromptCustom: incoming.aiPromptCustom ?? ''
          };
          savedRef.current = JSON.stringify(merged);
          setSettings(merged);
        })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [uid]);

  useEffect(() => {
    if (!isNativeIOS) return undefined;
    const root = document.documentElement;
    root.classList.add('settings-page-active');
    return () => {
      root.classList.remove('settings-page-active');
    };
  }, [isNativeIOS]);

  useEffect(() => {
    if (!uid || !user?.getIdToken) return;

    const syncEffectiveTier = async () => {
      try {
        const idToken = await user.getIdToken();
        if (!idToken) return;
        const response = await fetch('/api/account', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`
          },
          body: JSON.stringify({
            action: 'sync_subscription_tier',
            uid
          })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.success) return;
        if (!payload?.tier) return;
        setProfile((prev) => {
          if (!prev) return prev;
          if (prev?.subscription?.tier === payload.tier) return prev;
          return {
            ...prev,
            subscription: {
              ...(prev.subscription || {}),
              tier: payload.tier
            }
          };
        });
      } catch (error) {
        console.error('Tier sync failed', error);
      }
    };

    syncEffectiveTier();
  }, [uid, user]);

  useEffect(() => {
    setNotificationsSupported(areNotificationsSupported());
    getNotificationPermissionStatus()
      .then((permission) => setNotificationPermission(permission))
      .catch(() => setNotificationPermission(getNotificationPermission()));
  }, []);

  useEffect(() => {
    const hasEmail = user?.providerData?.some((p) => p.providerId === 'email') ?? false;
    const persistedPasswordLogin = Boolean(profile?.settings?.hasPasswordLogin);
    setHasPasswordLogin(hasEmail || persistedPasswordLogin);
  }, [user?.providerData?.length, user?.uid, profile?.settings?.hasPasswordLogin]);

  useEffect(() => {
    // Check Supabase identities directly in case password changes don't trigger parent update
    if (!uid) return;
    const checkSupabaseIdentities = async () => {
      const { data: { user: supabaseUser } } = await supabase.auth.getUser();
      if (supabaseUser?.identities?.some((i) => i.provider === 'email')) {
        setHasPasswordLogin(true);
      }
    };
    checkSupabaseIdentities().catch(console.error);
  }, [uid]);

  useEffect(() => {
    if (!status) return;
    const t = setTimeout(() => setStatus(''), 3000);
    return () => clearTimeout(t);
  }, [status]);

  useEffect(() => {
    if (!notificationMessage) return;
    const t = setTimeout(() => setNotificationMessage(''), 4000);
    return () => clearTimeout(t);
  }, [notificationMessage]);

  useEffect(() => {
    if (!passwordStatus) return;
    const t = setTimeout(() => setPasswordStatus(''), 4000);
    return () => clearTimeout(t);
  }, [passwordStatus]);

  useEffect(() => {
    if (!billingStatus) return;
    const t = setTimeout(() => setBillingStatus(''), 5000);
    return () => clearTimeout(t);
  }, [billingStatus]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get('payment');
    if (payment === 'success') {
      setBillingStatus('Payment complete. Your account updates within a few seconds.');
    } else if (payment === 'cancelled') {
      setBillingStatus('Checkout cancelled. No charge was made.');
    }
  }, []);

  const hasChanges = useMemo(() => JSON.stringify(settings) !== savedRef.current, [settings]);
  const update = useCallback((key, value) => setSettings((prev) => ({ ...prev, [key]: value })), []);
  const toggle = (key) => update(key, !settings[key]);

  const selectPreset = (id) => {
    const normalized = normalizePresetId(id);
    if (isPresetLocked(tier, normalized)) {
      setBillingStatus('That style is part of Pro. Upgrade to unlock it.');
      return;
    }
    update('aiPromptPreset', normalized);
  };

  const handleCustomPromptChange = (value) => {
    const trimmed = value.slice(0, MAX_PROMPT_LENGTH);
    update('aiPromptCustom', trimmed);
    setPromptError(!isPromptSafe(trimmed) ? 'This prompt contains blocked phrases. Please revise.' : '');
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
        const permission = await getNotificationPermissionStatus();
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
        setNotificationPermission(await getNotificationPermissionStatus());
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
    return next.length >= 8 && next === passwordForm.confirmPassword.trim();
  }, [passwordForm]);

  const handlePasswordSave = useCallback(async () => {
    setPasswordBusy(true);
    setPasswordError('');
    setPasswordStatus('');
    try {
      if (hasPasswordLogin) {
        // Send password reset email
        const { error } = await supabase.auth.resetPasswordForEmail(user?.email);
        if (error) throw error;
        setPasswordStatus('Password reset link sent to your email. Check your inbox.');
      } else {
        // Set new password
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
        const { error } = await supabase.auth.updateUser({ password: next });
        if (error) throw error;
        setHasPasswordLogin(true);
        // Persist this for refreshes, especially for OAuth users who add a password later.
        const persistedSettings = { ...(profile?.settings || {}), hasPasswordLogin: true };
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ settings: persistedSettings })
          .eq('id', uid);
        if (profileError) {
          console.error('Failed to persist hasPasswordLogin flag', profileError);
        } else {
          setProfile((prev) => (prev ? { ...prev, settings: persistedSettings } : prev));
        }
        // Refresh auth state to reflect new provider
        await supabase.auth.refreshSession();
        // Fetch updated session to ensure parent component sees new identity
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.identities?.some((i) => i.provider === 'email')) {
          setHasPasswordLogin(true);
        }
        setPasswordStatus('Password saved. You can now sign in with your email or username again.');
        setPasswordForm({ newPassword: '', confirmPassword: '' });
      }
    } catch (error) {
      setPasswordError(error.message || 'Failed to process password request.');
    } finally {
      setPasswordBusy(false);
    }
  }, [passwordForm, hasPasswordLogin, user?.email, profile?.settings, uid]);

  const notificationPermissionLabel = useMemo(() => {
    if (notificationPermission === 'granted') return 'Permission granted';
    if (notificationPermission === 'denied') return 'Permission blocked';
    return 'Permission pending';
  }, [notificationPermission]);

  const resolvedPrompt = useMemo(() => {
    const activePreset = isPresetLocked(tier, settings.aiPromptPreset) ? 'balanced' : settings.aiPromptPreset;
    if (activePreset === 'custom') {
      const sanitized = sanitizePrompt(settings.aiPromptCustom);
      return sanitized || 'Describe the insight style you want...';
    }
    const presetId = normalizePresetId(activePreset);
    return PROMPT_TEMPLATES[presetId] || PROMPT_TEMPLATES.balanced;
  }, [settings.aiPromptPreset, settings.aiPromptCustom, tier]);

  const canSave = useMemo(() => {
    if (!hasChanges) return false;
    if (isPresetLocked(tier, settings.aiPromptPreset)) return false;
    if (settings.aiPromptPreset === 'custom' && !isPromptSafe(settings.aiPromptCustom)) return false;
    return true;
  }, [hasChanges, settings.aiPromptPreset, settings.aiPromptCustom, tier]);

  const handleSave = async () => {
    if (!uid || saving || !canSave) return;
    setSaving(true);
    setStatus('');

    const presetId = normalizePresetId(settings.aiPromptPreset);
    const lockedForTier = isPresetLocked(tier, presetId);
    const effectivePreset = lockedForTier ? 'balanced' : presetId;
    const sanitizedCustom = sanitizePrompt(settings.aiPromptCustom);
    const savedSettings = {
      ...settings,
      aiPromptPreset: effectivePreset,
      aiPromptCustom: sanitizedCustom
    };

    try {
      const { error } = await supabase.from('profiles').update({ settings: savedSettings }).eq('id', uid);
      if (error) throw error;
      savedRef.current = JSON.stringify(savedSettings);
      setStatus('saved');
    } catch (err) {
      console.error('Settings save failed', err);
      setStatus('error');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => setSettings(DEFAULT_SETTINGS);

  const handleStartCheckout = async (mode, priceId, paymentLink) => {
    if (!uid || checkoutBusy) return;
    setCheckoutBusy(true);
    setBillingStatus('');
    
    try {
      // If a payment link is configured, use it directly
      if (paymentLink) {
        window.location.assign(paymentLink);
        return;
      }

      // Otherwise, use the checkout session flow with priceId
      if (!priceId) {
        setBillingStatus('Billing is not configured yet. Add Stripe price IDs or payment links in your environment first.');
        return;
      }

      const idToken = await user?.getIdToken?.();
      if (!idToken) {
        setBillingStatus('Please sign in again and retry checkout.');
        return;
      }

      const response = await fetch(STRIPE_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`
        },
        body: JSON.stringify({
          action: 'create_checkout',
          uid,
          priceId,
          mode,
          successUrl: `${window.location.origin}/settings?payment=success`,
          cancelUrl: `${window.location.origin}/settings?payment=cancelled`
        })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.url) {
        throw new Error(payload?.error || 'Unable to start checkout.');
      }
      window.location.assign(payload.url);
    } catch (error) {
      setBillingStatus(error.message || 'Unable to start checkout.');
    } finally {
      setCheckoutBusy(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!uid || deletingAccount) return;
    const confirmPhrase = 'DELETE';
    const typed = window.prompt('Type DELETE to permanently remove your account and all data.');
    if (typed !== confirmPhrase) {
      setBillingStatus('Account deletion cancelled.');
      return;
    }

    setDeletingAccount(true);
    setBillingStatus('');
    try {
      const idToken = await user?.getIdToken?.();
      if (!idToken) {
        throw new Error('Please sign in again and retry.');
      }

      const response = await fetch('/api/account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`
        },
        body: JSON.stringify({
          action: 'delete_account',
          uid,
          confirmText: confirmPhrase
        })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'Could not delete account.');
      }

      await supabase.auth.signOut();
      window.location.assign('/login');
    } catch (error) {
      setBillingStatus(error.message || 'Could not delete account.');
      setDeletingAccount(false);
    }
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
          <button type="button" className="ghost-btn" onClick={handleReset} disabled={saving}>Reset</button>
          <button type="button" className="primary-btn" onClick={handleSave} disabled={!canSave || saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
      {loading ? (
        <div className="settings-loading-state"><LoadingIndicator label="Loading preferences..." /></div>
      ) : (
        <div className="settings-sections">
          <section className="settings-section">
            <div className="settings-section-head">
              <h2>Billing</h2>
              <p>Upgrade to Pro for all AI styles plus 30 AI analyses per monthly billing cycle, or buy extra credits anytime.</p>
            </div>
            <div className="settings-section-body">
              <div className="notification-support">
                <span className={`notification-chip${tier === 'premium' ? ' success' : ''}`}>
                  Plan: {tier === 'premium' ? 'Pro' : 'Free'}
                </span>
                {tier === 'premium' ? (
                  <span className="notification-chip success">Pro credits this cycle left: {proRemaining}</span>
                ) : (
                  <span className="notification-chip">Free this month left: {freeRemaining}</span>
                )}
                <span className="notification-chip">Paid credits: {creditBalance}</span>
              </div>
              <div className="action-buttons">
                <button
                  type="button"
                  className="primary-btn"
                  onClick={() => handleStartCheckout('subscription', PREMIUM_PRICE_ID, PREMIUM_PAYMENT_LINK)}
                  disabled={checkoutBusy || tier === 'premium'}
                >
                  {tier === 'premium' ? 'Pro active' : (checkoutBusy ? 'Opening checkout...' : 'Subscribe to Pro')}
                </button>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => handleStartCheckout('payment', CREDIT_PRICE_ID, CREDIT_PAYMENT_LINK)}
                  disabled={checkoutBusy}
                >
                  {checkoutBusy ? 'Opening checkout...' : 'Buy 10 AI credits'}
                </button>
              </div>
              {billingStatus && <p className="notification-alert">{billingStatus}</p>}
            </div>
          </section>

          <section className="settings-section">
            <div className="settings-section-head">
              <h2>AI insight style</h2>
              <p>Free includes three styles. Upgrade to Pro to unlock all styles and custom instructions.</p>
            </div>
            <div className="settings-section-body">
              <div className="prompt-options">
                {PROMPT_PRESETS.map((preset) => {
                  const locked = isPresetLocked(tier, preset.id);
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      className={`prompt-option${settings.aiPromptPreset === preset.id ? ' selected' : ''}${locked ? ' locked' : ''}`}
                      onClick={() => selectPreset(preset.id)}
                    >
                      <h3>
                        {preset.title}
                        {locked && <span className="preset-lock-pill">Pro</span>}
                      </h3>
                      <p>{preset.description}</p>
                    </button>
                  );
                })}
              </div>
              {settings.aiPromptPreset === 'custom' && tier === 'premium' && (
                <div className="custom-prompt-area">
                  <label htmlFor="customPrompt">Your custom instructions</label>
                  <textarea
                    id="customPrompt"
                    value={settings.aiPromptCustom}
                    onChange={(e) => handleCustomPromptChange(e.target.value)}
                    maxLength={MAX_PROMPT_LENGTH}
                    placeholder="E.g. Act like a Jungian analyst who references mythology and gives one concrete journaling prompt at the end."
                  />
                  {promptError && <p className="prompt-error">{promptError}</p>}
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
                <div className="toggle-label"><strong>Push notifications</strong><span>Receive updates even when NightLink is closed.</span></div>
                <Toggle id="notificationsEnabled" checked={settings.notificationsEnabled} onChange={handleNotificationsToggle} disabled={!notificationsSupported || notificationBusy} />
              </div>
              <div className="toggle-row">
                <div className="toggle-label"><strong>Dream reminders</strong><span>Morning nudges to capture your dream journal while it is fresh.</span></div>
                <Toggle id="notifyDreamReminders" checked={settings.notifyDreamReminders} onChange={() => toggle('notifyDreamReminders')} disabled={!settings.notificationsEnabled} />
              </div>
              <div className="toggle-row">
                <div className="toggle-label"><strong>New feed drops</strong><span>Alerts when people you follow share new dreams or journal entries.</span></div>
                <Toggle id="notifyFeedUpdates" checked={settings.notifyFeedUpdates} onChange={() => toggle('notifyFeedUpdates')} disabled={!settings.notificationsEnabled} />
              </div>
              <div className="toggle-row">
                <div className="toggle-label"><strong>Activity alerts</strong><span>Followers, comments, and reactions-AI insights are never pushed.</span></div>
                <Toggle id="notifyActivityAlerts" checked={settings.notifyActivityAlerts} onChange={() => toggle('notifyActivityAlerts')} disabled={!settings.notificationsEnabled} />
              </div>
              {notificationMessage && <p className="notification-alert">{notificationMessage}</p>}
            </div>
          </section>

          <section className="settings-section">
            <div className="settings-section-head">
              <h2>Account access</h2>
              <p>{hasPasswordLogin ? 'Reset your password.' : 'Enable password login.'}</p>
            </div>
            <div className="settings-section-body">
              {hasPasswordLogin ? (
                <>
                  <p className="password-helper">Send a password reset link to your email.</p>
                  <button type="button" className="primary-btn password-btn" onClick={handlePasswordSave} disabled={passwordBusy}>
                    {passwordBusy ? 'Sending...' : 'Send reset password email'}
                  </button>
                  {passwordStatus && <p className="password-success">{passwordStatus}</p>}
                  {passwordError && <p className="password-error">{passwordError}</p>}
                </>
              ) : (
                <>
                  <p className="password-helper">Set a password so you can sign in with your email or username.</p>
                  <div className="password-fields">
                    <input type="password" placeholder="New password" value={passwordForm.newPassword} onChange={(e) => handlePasswordField('newPassword', e.target.value)} minLength={8} autoComplete="new-password" />
                    <input type="password" placeholder="Confirm new password" value={passwordForm.confirmPassword} onChange={(e) => handlePasswordField('confirmPassword', e.target.value)} minLength={8} autoComplete="new-password" />
                  </div>
                  <p className="password-hint">Use at least 8 characters.</p>
                  {passwordError && <p className="password-error">{passwordError}</p>}
                  {passwordStatus && <p className="password-success">{passwordStatus}</p>}
                  <button type="button" className="primary-btn password-btn" onClick={handlePasswordSave} disabled={!passwordRequirementsMet || passwordBusy}>
                    {passwordBusy ? 'Saving...' : 'Enable password login'}
                  </button>
                </>
              )}
            </div>
          </section>

          <section className="settings-section">
            <div className="settings-section-head">
              <h2>Legal</h2>
              <p>Review the required policies before publishing in app stores.</p>
            </div>
            <div className="settings-section-body">
              <div className="action-buttons">
                <a className="ghost-btn legal-link-btn" href="/terms" target="_blank" rel="noreferrer">Terms of Use</a>
                <a className="ghost-btn legal-link-btn" href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>
              </div>
            </div>
          </section>

          <section className="settings-section danger-zone">
            <div className="settings-section-head">
              <h2>Delete account</h2>
              <p>Permanently remove your account and all associated data.</p>
            </div>
            <div className="settings-section-body">
              <p className="settings-footnote">This action cannot be undone. You will be asked to type DELETE to confirm.</p>
              <button type="button" className="danger-btn" onClick={handleDeleteAccount} disabled={deletingAccount}>
                {deletingAccount ? 'Deleting account...' : 'Delete account permanently'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

Settings.propTypes = {
  user: appUserPropType
};
