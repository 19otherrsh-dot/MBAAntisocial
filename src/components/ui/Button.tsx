'use client';

import { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import styles from './ui.module.css';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'soft'
  | 'danger'
  | 'dangerGhost';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  iconAfter?: React.ReactNode;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    children,
    variant = 'primary',
    size = 'md',
    fullWidth,
    loading = false,
    icon,
    iconAfter,
    className,
    disabled,
    type = 'button',
    ...rest
  },
  ref
) {
  const iconOnly = !children;

  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        styles.button,
        styles[variant],
        styles[size],
        iconOnly && styles.iconOnly,
        fullWidth && styles.fullWidth,
        className
      )}
      disabled={disabled || loading}
      // Announces the pending state rather than only showing a spinner.
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className={styles.spinner} aria-hidden /> : icon}
      {children && <span className={cn(loading && styles.loadingLabel)}>{children}</span>}
      {!loading && iconAfter}
    </button>
  );
});

export default Button;
