import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useNavigate } from 'react-router-dom';
import LoadingIndicator from '../components/LoadingIndicator';
import { firebaseUserPropType } from '../propTypes';
import './Settings.css';

const DEFAULT_SETTINGS = {
  aiPromptPreset: 'balanced',
  aiPromptCustom: ''
};

const PROMPT_PRESETS = [
  {
    id: 'balanced',
    title: 'Balanced guide',
    description: 'Mix meaningful symbols with grounded actions you can take today.'
  },
  {
    id: 'investigator',
    title: 'Detective mode',
    description: 'Hunt for patterns, archetypes, and hidden meanings like a sleuth.'
  },
  {
    id: 'therapist',
    title: 'Inner therapist',
    description: 'Compassionate emotional processing with gentle self-reflection questions.'
  },
  {
    id: 'coach',
    title: 'Sleep coach',
    description: 'Focus on rest quality, stress signals, and calming bedtime rituals.'
  },
  {
    id: 'creative',
    title: 'Story weaver',
    description: 'Turn your dream into a narrative seed for writing or worldbuilding.'
  },
  {
    id: 'mystical',
    title: 'Mystic oracle',
    description: 'Poetic interpretations with archetypal wisdom and spiritual vibes.'
  },
  {
    id: 'comedian',
    title: 'Dream comedian',
    description: 'Light-hearted, humorous takes on the absurdity of your subconscious.'
  },
  {
    id: 'scientist',
    title: 'Brain scientist',
    description: 'Neuroscience-backed explanations of REM sleep and memory processing.'
  },
  {
    id: 'custom',
    title: 'Custom',
    description: 'Write your own instructions for exactly how insights should feel.'
  }
];

const PROMPT_TEMPLATES = {
  balanced: 'You are a compassionate dream interpreter. Analyze the dream by identifying 1-2 key symbolic elements and their possible meanings, then suggest one practical reflection question and one small grounded action the dreamer can take. Keep your response to a single short paragraph (3-6 sentences max). Be warm, insightful, and concise.',
  investigator: 'You are a dream detective analyzing this entry like evidence at a crime scene. Identify recurring symbols, archetypal patterns, or subconscious clues, and explain why these elements might be significant based on common dream symbolism. Present your findings in a single short paragraph (3-6 sentences max). Be analytical but avoid overexplaining.',
  therapist: 'You are a gentle inner therapist helping someone process their emotions through dreams. Acknowledge the feelings present in the dream, reflect on what emotional needs or conflicts might be surfacing, and offer one compassionate self-inquiry question. Keep your response to a single short paragraph (3-6 sentences max). Be empathetic and non-judgmental.',
  coach: 'You are a sleep and wellness coach reviewing this dream for stress signals and rest quality indicators. Point out any nervous system cues (anxiety, excitement, exhaustion) and suggest one calming ritual or sleep hygiene tip the dreamer could try tonight. Respond in a single short paragraph (3-6 sentences max). Be practical and supportive.',
  creative: 'You are a creative writing mentor helping turn dream imagery into story fuel. Highlight the most vivid or unusual elements, suggest a narrative angle (character arc, worldbuilding hook, or plot twist), and keep the dreamer emotionally grounded while sparking their imagination. Respond in a single short paragraph (3-6 sentences max). Be inspiring but concise.',
  mystical: 'You are a mystical oracle interpreting dreams through archetypal and spiritual lenses. Weave in poetic language, universal symbols (moon, journey, shadow, rebirth), and a sense of deeper meaning or soul lesson. Keep your message to a single short paragraph (3-6 sentences max). Be enchanting but not vague.',
  comedian: 'You are a dream comedian finding the humor in subconscious absurdity. Point out the funniest or most ridiculous aspects of the dream with light-hearted commentary, but still acknowledge any underlying feelings with kindness. Keep it to a single short paragraph (3-6 sentences max). Be playful, warm, and genuinely funny.',
  scientist: 'You are a neuroscientist explaining dreams through the lens of brain science and REM sleep. Reference memory consolidation, emotional processing, or neural patterns, and help the dreamer understand why their brain might have created this scenario. Respond in a single short paragraph (3-6 sentences max). Be informative but accessible.',
  custom: ''
};

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
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
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

function Toggle({ checked, onChange, id }) {
  return (
    <label className="toggle-switch" htmlFor={id}>
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={onChange}
      />
      <span className="toggle-track" />
    </label>
  );
}

Toggle.propTypes = {
  checked: PropTypes.bool.isRequired,
  onChange: PropTypes.func.isRequired,
  id: PropTypes.string.isRequired
};

export default function Settings({ user }) {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
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

      savedRef.current = JSON.stringify(merged);
      setSettings(merged);
    }, () => {
      setLoading(false);
    });

    return () => unsubscribe();
  }, [uid]);

  useEffect(() => {
    if (!status) return undefined;
    const t = setTimeout(() => setStatus(''), 3000);
    return () => clearTimeout(t);
  }, [status]);

  const [promptError, setPromptError] = useState('');

  const hasChanges = useMemo(() => (
    JSON.stringify(settings) !== savedRef.current
  ), [settings]);

  const update = useCallback((key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const toggle = (key) => update(key, !settings[key]);

  const selectPreset = (id) => {
    update('aiPromptPreset', id);
    if (id !== 'custom') {
      update('aiPromptCustom', '');
      setPromptError('');
    }
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

  const resolvedPrompt = useMemo(() => {
    if (settings.aiPromptPreset === 'custom') {
      const sanitized = sanitizePrompt(settings.aiPromptCustom);
      return sanitized || 'Describe the insight style you want…';
    }
    return PROMPT_TEMPLATES[settings.aiPromptPreset] || PROMPT_TEMPLATES.balanced;
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
    const promptText = settings.aiPromptPreset === 'custom'
      ? sanitizedCustom
      : PROMPT_TEMPLATES[settings.aiPromptPreset];

    const payload = {
      settings: {
        ...settings,
        aiPromptCustom: settings.aiPromptPreset === 'custom' ? sanitizedCustom : ''
      },
      aiPromptPreference: {
        preset: settings.aiPromptPreset,
        customPrompt: settings.aiPromptPreset === 'custom' ? sanitizedCustom : '',
        prompt: promptText,
        updatedAt: serverTimestamp()
      },
      settingsUpdatedAt: serverTimestamp()
    };

    try {
      await updateDoc(doc(db, 'users', uid), payload);
      savedRef.current = JSON.stringify({
        ...settings,
        aiPromptCustom: settings.aiPromptPreset === 'custom' ? settings.aiPromptCustom : ''
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
        <p>Customize how AI interprets your dreams.</p>
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
        </div>
      )}
    </div>
  );
}

Settings.propTypes = {
  user: firebaseUserPropType
};
