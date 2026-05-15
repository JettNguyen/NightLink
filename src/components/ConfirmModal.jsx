import './ConfirmModal.css';

/**
 * ConfirmModal — replaces window.confirm and window.prompt.
 *
 * Props:
 *   title        string   — heading
 *   message      string   — body text
 *   confirmLabel string   — confirm button text (default "Confirm")
 *   cancelLabel  string   — cancel button text (default "Cancel")
 *   danger       bool     — red confirm button
 *   inputLabel   string   — if set, shows a text input and passes its value to onConfirm
 *   inputPlaceholder string
 *   onConfirm    fn(value?) — called with input value if input mode
 *   onCancel     fn
 */
export default function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  inputLabel,
  inputPlaceholder = '',
  inputValue = '',
  onInputChange,
  onConfirm,
  onCancel,
  confirmDisabled = false,
}) {
  return (
    <div className="confirm-modal-backdrop" onClick={onCancel}>
      <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
        {title && <h3 className="confirm-modal-title">{title}</h3>}
        {message && <p className="confirm-modal-message">{message}</p>}
        {inputLabel && (
          <label className="confirm-modal-input-label">
            {inputLabel}
            <input
              type="text"
              className="confirm-modal-input"
              placeholder={inputPlaceholder}
              value={inputValue}
              onChange={(e) => onInputChange?.(e.target.value)}
              autoFocus
            />
          </label>
        )}
        <div className="confirm-modal-actions">
          <button type="button" className="secondary-btn" onClick={onCancel}>{cancelLabel}</button>
          <button
            type="button"
            className={danger ? 'danger-btn' : 'primary-btn'}
            onClick={onConfirm}
            disabled={confirmDisabled}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
