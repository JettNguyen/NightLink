import { useCallback, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMicrophone, faStop, faXmark } from '@fortawesome/free-solid-svg-icons';
import useVoiceCapture, { isVoiceCaptureSupported, MAX_RECORDING_MS } from '../hooks/useVoiceCapture';
import { triggerLightHaptic, triggerMediumHaptic } from '../utils/haptics';
import './VoiceInput.css';

const BAR_COUNT = 24;
const SUPPORTED = isVoiceCaptureSupported();

const formatClock = (ms) => {
  const total = Math.floor(ms / 1000);
  return `0:${String(Math.min(total, 99)).padStart(2, '0')}`;
};

/**
 * Mic button that dictates into a text field.
 *
 * The waveform is driven straight from the analyser inside a rAF loop and
 * written to the bars as inline transforms — keeping 60fps amplitude out of
 * React state, which would otherwise re-render the whole composer every frame.
 */
export default function VoiceInput({ onTranscript, onNotice, disabled, label }) {
  const barsRef = useRef(null);
  const frameRef = useRef(null);
  const levelsRef = useRef(new Float32Array(BAR_COUNT));

  const handleTranscript = useCallback((text) => {
    void triggerMediumHaptic();
    onTranscript(text);
  }, [onTranscript]);

  const handleError = useCallback((message) => {
    onNotice?.(message);
  }, [onNotice]);

  const { status, elapsedMs, analyserRef, start, stop, cancel } = useVoiceCapture({
    onTranscript: handleTranscript,
    onError: handleError,
  });

  const isRecording = status === 'recording';
  const isBusy = status === 'starting' || status === 'transcribing';

  // Paint the bars from live amplitude for as long as we are recording.
  useEffect(() => {
    if (!isRecording) {
      if (frameRef.current) { cancelAnimationFrame(frameRef.current); frameRef.current = null; }
      const bars = barsRef.current?.children;
      if (bars) {
        for (let i = 0; i < bars.length; i += 1) bars[i].style.transform = 'scaleY(0.08)';
      }
      levelsRef.current.fill(0);
      return undefined;
    }

    const spectrum = new Uint8Array(analyserRef.current?.frequencyBinCount || BAR_COUNT);

    const paint = () => {
      frameRef.current = requestAnimationFrame(paint);
      const analyser = analyserRef.current;
      const bars = barsRef.current?.children;
      if (!bars) return;

      if (analyser) analyser.getByteFrequencyData(spectrum);

      // Speech lives in the lower bins, so sample the bottom ~60% of the
      // spectrum and mirror it outward from the centre.
      const usable = Math.max(1, Math.floor(spectrum.length * 0.6));
      const half = Math.ceil(BAR_COUNT / 2);

      for (let i = 0; i < half; i += 1) {
        const bin = Math.floor((i / half) * usable);
        const raw = analyser ? spectrum[bin] / 255 : 0;
        // Ease upward fast and fall away slowly — reads as speech, not noise.
        const previous = levelsRef.current[i];
        const next = raw > previous ? raw : previous * 0.82 + raw * 0.18;
        levelsRef.current[i] = next;

        const scale = Math.max(0.08, Math.min(1, next * 1.35));
        const left = bars[half - 1 - i];
        const right = bars[half + i];
        if (left) left.style.transform = `scaleY(${scale.toFixed(3)})`;
        if (right) right.style.transform = `scaleY(${scale.toFixed(3)})`;
      }
    };

    frameRef.current = requestAnimationFrame(paint);
    return () => {
      if (frameRef.current) { cancelAnimationFrame(frameRef.current); frameRef.current = null; }
    };
  }, [isRecording, analyserRef]);

  if (!SUPPORTED) return null;

  const handleToggle = () => {
    void triggerLightHaptic();
    if (isRecording) stop();
    else start();
  };

  const remaining = Math.max(0, MAX_RECORDING_MS - elapsedMs);
  const runningOut = isRecording && remaining <= 10_000;

  return (
    <div className={`voice-input${isRecording ? ' is-recording' : ''}`}>
      {isRecording && (
        <div className="voice-input-live">
          <button
            type="button"
            className="voice-input-cancel"
            onClick={() => { void triggerLightHaptic(); cancel(); }}
            aria-label="Discard recording"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
          <div className="voice-wave" ref={barsRef} aria-hidden="true">
            {Array.from({ length: BAR_COUNT }, (_, i) => (
              <span key={i} className="voice-wave-bar" />
            ))}
          </div>
          <span className={`voice-input-clock${runningOut ? ' is-ending' : ''}`}>
            {formatClock(elapsedMs)}
          </span>
        </div>
      )}

      <button
        type="button"
        className={`voice-input-btn${isRecording ? ' is-recording' : ''}${isBusy ? ' is-busy' : ''}`}
        onClick={handleToggle}
        disabled={disabled || isBusy}
        aria-label={isRecording ? 'Stop recording and transcribe' : label}
        aria-live="polite"
      >
        {status === 'transcribing' ? (
          <span className="voice-input-spinner" aria-hidden="true" />
        ) : (
          <FontAwesomeIcon icon={isRecording ? faStop : faMicrophone} />
        )}
        <span className="sr-only">
          {status === 'transcribing' ? 'Transcribing your recording' : ''}
        </span>
      </button>
    </div>
  );
}

VoiceInput.propTypes = {
  onTranscript: PropTypes.func.isRequired,
  onNotice: PropTypes.func,
  disabled: PropTypes.bool,
  label: PropTypes.string,
};

VoiceInput.defaultProps = {
  onNotice: undefined,
  disabled: false,
  label: 'Dictate with your voice',
};
