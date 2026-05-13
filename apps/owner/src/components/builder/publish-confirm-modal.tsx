'use client';

// Confirmation dialog for the sticky-bar Re-publish button. Hand-rolled (no shadcn dialog dep)
// in the same style as `components/layout/mobile-sidebar.tsx`: fixed backdrop + centred panel,
// `role="dialog" aria-modal`, Escape-to-close. The primary button calls `onConfirm` (which
// closes the modal and kicks off the publish job in <BuilderShell>). Once the job is running,
// the progress fill + "Generating X/7…" counter live only on the sticky-bar button.
//
// Two modes:
//   - `'confirm'` — the default Re-publish prompt.
//   - `'enhance-missing'` — shown when `startPublishAction` / `regenerateVariantAction` returns
//     `{ needsEnhanceConfirm: true }` (the polished description hasn't been generated yet). Same
//     visual shell, different title/body/primary label so the owner knows the typed text will be
//     used as-is.

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export type PublishConfirmMode = 'confirm' | 'enhance-missing';

export function PublishConfirmModal({
  open,
  onClose,
  onConfirm,
  published,
  mode = 'confirm',
  confirmLabelOverride,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  published: boolean;
  mode?: PublishConfirmMode;
  /** Override the primary-button label — used by Regenerate to read "Regenerate anyway". */
  confirmLabelOverride?: string;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const title =
    mode === 'enhance-missing'
      ? 'Generate without enhanced text?'
      : published
        ? 'Re-publish your page'
        : 'Publish your page';

  const body =
    mode === 'enhance-missing'
      ? "You haven't enhanced your description yet. The 7 audience pages will be generated from your typed description as-is. You can click Cancel, then Enhance, then Re-publish for higher-quality copy."
      : 'Publishing will generate a tailored version of your page for each of the 7 audiences. Your page address is also frozen on a first publish.';

  const defaultLabel =
    mode === 'enhance-missing' ? 'Generate anyway' : published ? 'Re-publish' : 'Publish';
  const confirmLabel = confirmLabelOverride ?? defaultLabel;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="publish-confirm-title"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-foreground/40"
      />
      <div className="relative z-10 w-full max-w-md space-y-4 rounded-lg border bg-card p-6 shadow-lg">
        <h2 id="publish-confirm-title" className="text-lg font-semibold tracking-tight">
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">{body}</p>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
