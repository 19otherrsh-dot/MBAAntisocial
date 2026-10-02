'use client';

import { forwardRef, useId } from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import styles from './ui.module.css';

interface FieldShellProps {
  label?: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  htmlFor?: string;
  children: React.ReactNode;
  /** Rendered at the right of the label row, e.g. a character counter. */
  aside?: React.ReactNode;
}

/** Label, hint, and error scaffolding shared by every form control. */
export function Field({ label, hint, error, optional, htmlFor, children, aside }: FieldShellProps) {
  return (
    <div className={styles.field}>
      {(label || aside) && (
        <div className="row gap-2">
          {label && (
            <label className={styles.label} htmlFor={htmlFor}>
              {label}
              {optional && <span className={styles.optional}>optional</span>}
            </label>
          )}
          {aside}
        </div>
      )}
      {children}
      {/* `role="alert"` so a validation failure is announced, not just coloured. */}
      {error ? (
        <p className={styles.error} role="alert">
          <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
          {error}
        </p>
      ) : (
        hint && <p className={styles.hint}>{hint}</p>
      )}
    </div>
  );
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  icon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, optional, icon, className, id, ...rest },
  ref
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <Field label={label} hint={hint} error={error} optional={optional} htmlFor={inputId}>
      <div className={styles.inputWrap}>
        {icon && <span className={styles.inputIcon}>{icon}</span>}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            styles.control,
            icon && styles.hasIcon,
            error && styles.controlInvalid,
            className
          )}
          aria-invalid={error ? true : undefined}
          {...rest}
        />
      </div>
    </Field>
  );
});

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  /** Shows a live counter and flags an over-length value. */
  showCount?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, optional, showCount, className, id, maxLength, value, ...rest },
  ref
) {
  const generatedId = useId();
  const textareaId = id ?? generatedId;
  const length = typeof value === 'string' ? value.length : 0;
  const over = maxLength !== undefined && length > maxLength;

  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      optional={optional}
      htmlFor={textareaId}
      aside={
        showCount && maxLength !== undefined ? (
          <span className={cn(styles.charCount, over && styles.charCountOver)}>
            {length}/{maxLength}
          </span>
        ) : undefined
      }
    >
      <textarea
        ref={ref}
        id={textareaId}
        value={value}
        // Left off the element so a paste over the limit is flagged rather than
        // silently truncated; the counter and submit guard handle enforcement.
        className={cn(styles.control, styles.textarea, error && styles.controlInvalid, className)}
        aria-invalid={error ? true : undefined}
        {...rest}
      />
    </Field>
  );
});

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  options: ReadonlyArray<{ value: string; label: string; disabled?: boolean }>;
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, optional, options, placeholder, className, id, ...rest },
  ref
) {
  const generatedId = useId();
  const selectId = id ?? generatedId;

  return (
    <Field label={label} hint={hint} error={error} optional={optional} htmlFor={selectId}>
      <select
        ref={ref}
        id={selectId}
        className={cn(styles.control, styles.select, error && styles.controlInvalid, className)}
        aria-invalid={error ? true : undefined}
        {...rest}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
});

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}

export function Switch({ checked, onChange, label, hint, disabled }: SwitchProps) {
  return (
    <label className={styles.switchRow}>
      <input
        type="checkbox"
        className={styles.switchInput}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className={cn(styles.switchTrack, checked && styles.switchOn)} aria-hidden>
        <span className={styles.switchThumb} />
      </span>
      <span className={styles.switchText}>
        <span className={styles.switchLabel}>{label}</span>
        {hint && <span className={styles.switchHint}>{hint}</span>}
      </span>
    </label>
  );
}
