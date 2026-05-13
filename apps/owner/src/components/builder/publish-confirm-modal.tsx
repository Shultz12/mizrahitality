'use client';

// Confirmation modal for the sticky bar's Re-publish button. Hand-rolled (no shadcn dialog dep)
// in the same style as `components/layout/mobile-sidebar.tsx`: fixed backdrop + centred panel,
// `role="dialog" aria-modal`, Escape-to-close. Its primary action is a `type="submit"` button
// targeting the empty `id="publish-form"` mounted in <BuilderShell>, so the existing
// useActionState wiring and the sticky-bar status messages all still apply.

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useBuilderShell } from './builder-shell';

export function PublishConfirmModal({
  open,
  onClose,
  published,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  published: boolean;
  pending: boolean;
}) {
  const { publishFormId } = useBuilderShell();

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !pending) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, pending, onClose]);

  if (!open) return null;

  const title = published ? 'Re-publish your page' : 'Publish your page';
  const submitLabel = pending
    ? 'Generating 7 audience pages…'
    : published
      ? 'Re-publish'
      : 'Publish';

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
        onClick={pending ? undefined : onClose}
        className="absolute inset-0 bg-foreground/40"
        disabled={pending}
      />
      <div className="relative z-10 w-full max-w-md space-y-4 rounded-lg border bg-card p-6 shadow-lg">
        <h2 id="publish-confirm-title" className="text-lg font-semibold tracking-tight">
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">
          Publishing polishes your description with AI and generates a tailored version for each
          of the 7 audiences. Your page address is also frozen.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button form={publishFormId} type="submit" disabled={pending}>
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
