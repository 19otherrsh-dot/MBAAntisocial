'use client';

import { forwardRef } from 'react';
import Link, { type LinkProps } from 'next/link';
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

export interface LinkButtonProps extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  href: LinkProps['href'];
  prefetch?: LinkProps['prefetch'];
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  icon?: React.ReactNode;
  iconAfter?: React.ReactNode;
}

/**
 * A link that looks like a button. Use it instead of wrapping <Button> in a
 * <Link>: that nests a button inside a link, which is invalid HTML and costs
 * keyboard users two tab stops for one control.
 */
export function LinkButton({ href, variant = 'primary', size = 'md', fullWidth, icon, iconAfter, className, children, ...rest }: LinkButtonProps) {
  return (
    <Link
      href={href}
      className={cn(styles.button, styles[variant], styles[size], !children && styles.iconOnly, fullWidth && styles.fullWidth, className)}
      {...rest}
    >
      {icon}
      {children && <span>{children}</span>}
      {iconAfter}
    </Link>
  );
}
