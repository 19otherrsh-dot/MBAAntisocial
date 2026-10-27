'use client';

import { useCallback, useRef, useState } from 'react';
import Dialog from './Dialog';
import Button from './Button';
import { Banner } from './Display';

export interface ConfirmOptions {
  title: string;
  body?: string;
  /** Extra emphasis for a consequence the user should not miss. */
  warning?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

/**
 * A promise-based confirmation dialog.
 *
 * Replaces `window.confirm`, which cannot be styled, ignores the theme, blocks
 * the main thread, and on mobile renders as a browser-chrome alert that looks
 * like it came from somewhere else entirely.
 *
 * ```tsx
 * const { confirm, dialog } = useConfirm();
 * if (await confirm({ title: 'Cancel this session?' })) { … }
 * // render {dialog} once, anywhere in the tree
 * ```
 */
export function useConfirm() {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((next: ConfirmOptions) => {
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
  }, []);

  const dialog = options ? (
    <Dialog
      open
      onClose={() => settle(false)}
      title={options.title}
      description={options.body}
      footer={
        <>
          <Button variant="ghost" onClick={() => settle(false)}>
            {options.cancelLabel ?? 'Never mind'}
          </Button>
          <Button
            variant={options.destructive ? 'danger' : 'primary'}
            onClick={() => settle(true)}
          >
            {options.confirmLabel ?? 'Confirm'}
          </Button>
        </>
      }
    >
      {options.warning ? <Banner variant="warning">{options.warning}</Banner> : null}
    </Dialog>
  ) : null;

  return { confirm, dialog };
}
