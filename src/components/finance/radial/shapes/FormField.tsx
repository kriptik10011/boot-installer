/**
 * FormField — Inline input with colored underline indicator.
 * Label text lives inside the field as placeholder. Thin colored line
 * below the input indicates the field type. No separate label above.
 * Slider variant includes inline label, custom styled track/thumb, and formatted value.
 * Pure props, cqi-responsive.
 */

import { CARD_SIZES, FONT_FAMILY } from '../cardTemplate';

// ── Slider track CSS (injected once) ────────────────────────────────────────

const SLIDER_STYLE_ID = 'form-field-slider-styles';

function ensureSliderStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(SLIDER_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = SLIDER_STYLE_ID;
  style.textContent = `
    input.form-slider {
      -webkit-appearance: none;
      appearance: none;
      background: transparent;
      cursor: pointer;
      width: 100%;
    }
    input.form-slider::-webkit-slider-runnable-track {
      height: 0.5cqi;
      border-radius: 999px;
      background: rgba(71, 85, 105, 0.5);
    }
    input.form-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 1.4cqi;
      height: 1.4cqi;
      border-radius: 50%;
      background: #94a3b8;
      margin-top: -0.45cqi;
      border: none;
      box-shadow: 0 0 3px rgba(148, 163, 184, 0.4);
    }
    input.form-slider::-moz-range-track {
      height: 0.5cqi;
      border-radius: 999px;
      background: rgba(71, 85, 105, 0.5);
    }
    input.form-slider::-moz-range-thumb {
      width: 1.4cqi;
      height: 1.4cqi;
      border-radius: 50%;
      background: #94a3b8;
      border: none;
      box-shadow: 0 0 3px rgba(148, 163, 184, 0.4);
    }
  `;
  document.head.appendChild(style);
}

// ── Types ────────────────────────────────────────────────────────────────────

interface FormFieldBaseProps {
  label: string;
  /** Accent color for the underline indicator */
  accentColor?: string;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  autoFocus?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}

interface TextFieldProps extends FormFieldBaseProps {
  type: 'text';
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
}

interface SelectFieldProps extends FormFieldBaseProps {
  type: 'select';
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
}

interface SliderFieldProps extends FormFieldBaseProps {
  type: 'slider';
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Format function for display value */
  format?: (v: number) => string;
}

interface TextareaFieldProps extends FormFieldBaseProps {
  type: 'textarea';
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}

export type FormFieldProps = TextFieldProps | SelectFieldProps | SliderFieldProps | TextareaFieldProps;

const INPUT_STYLE: React.CSSProperties = {
  fontSize: `${CARD_SIZES.sectionContent}cqi`,
  fontFamily: FONT_FAMILY,
  background: 'transparent',
  border: 'none',
  borderRadius: 0,
  padding: '0.4cqi 0',
  color: '#e2e8f0',
  outline: 'none',
  width: '100%',
  textAlign: 'center',
};

export function FormField(props: FormFieldProps) {
  const accent = props.accentColor ?? '#94a3b8';

  return (
    <div className={`flex flex-col ${props.className ?? ''}`}>
      {renderInput(props)}
      {props.type !== 'slider' && (
        <div style={{ height: '1px', background: accent, opacity: 0.4, marginTop: '0.2cqi' }} />
      )}
    </div>
  );
}

function renderInput(props: FormFieldProps) {
  const shared = {
    onKeyDown: props.onKeyDown,
    autoFocus: props.autoFocus,
    onClick: props.onClick,
  };

  switch (props.type) {
    case 'text':
      return (
        <input
          type="text"
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          placeholder={props.placeholder ?? props.label}
          maxLength={props.maxLength}
          style={INPUT_STYLE}
          {...shared}
        />
      );

    case 'textarea':
      return (
        <textarea
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          placeholder={props.placeholder ?? props.label}
          rows={props.rows ?? 2}
          style={{ ...INPUT_STYLE, resize: 'none' }}
          {...shared}
        />
      );

    case 'select':
      return (
        <select
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          style={{ ...INPUT_STYLE, cursor: 'pointer' }}
          {...shared}
        >
          {props.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );

    case 'slider': {
      ensureSliderStyles();
      const safe = typeof props.value === 'number' && !Number.isNaN(props.value) ? props.value : (props.min ?? 0);
      const step = props.step ?? 1;
      const displayValue = props.format ? props.format(safe) : safe.toFixed(step < 0.1 ? 2 : step < 1 ? 1 : 0);
      return (
        <div className="flex items-center" style={{ gap: '1cqi' }}>
          <span
            style={{
              fontSize: `${CARD_SIZES.sectionContent}cqi`,
              fontFamily: FONT_FAMILY,
              color: '#94a3b8',
              width: '18cqi',
              flexShrink: 0,
            }}
          >
            {props.label}
          </span>
          <input
            type="range"
            className="form-slider"
            value={safe}
            onChange={(e) => props.onChange(parseFloat(e.target.value))}
            min={props.min ?? 0}
            max={props.max ?? 100}
            step={step}
            style={{ flex: 1 }}
            {...shared}
          />
          <span
            style={{
              fontSize: `${CARD_SIZES.sectionContent * 0.9}cqi`,
              fontFamily: 'monospace',
              color: '#94a3b8',
              width: '8cqi',
              textAlign: 'right' as const,
              flexShrink: 0,
            }}
          >
            {displayValue}
          </span>
        </div>
      );
    }
  }
}
