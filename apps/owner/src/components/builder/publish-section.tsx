'use client';

// The Publish form — input-less; its submit button lives in the sticky bar (<BuilderShell>) and
// targets this form via the HTML `form="publish-form"` attribute. The card itself is now a small
// status surface: a one-line explainer of what Publish does and, once published, a link to view
// the live page in a new tab. All status / errors live in the sticky bar.

import Link from 'next/link';
import { useBuilderShell } from './builder-shell';

export function PublishSection({ published }: { published: boolean }) {
  const { publishFormId, publishFormAction } = useBuilderShell();

  return (
    <>
      {/* Empty form — the bar's "Re-publish" button submits this via the `form` attribute. Always
          rendered so the form exists in the DOM regardless of publish state. */}
      <form id={publishFormId} action={publishFormAction} />

      <div className="space-y-3 rounded-lg border bg-card p-6">
        <h2 className="text-lg font-semibold tracking-tight">Publish</h2>
        <p className="text-sm text-muted-foreground">
          Publishing polishes your description with AI and generates a tailored version for each of
          the 7 audiences. Your page address is also frozen. Use the Re-publish button at the top
          of the page.
        </p>
        {published && (
          <p className="text-sm">
            <Link
              href="/preview"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              View your published page →
            </Link>{' '}
            <span className="text-muted-foreground">
              (append <code>?type=</code> — e.g. <code>?type=female-18-30</code> — to preview each
              audience)
            </span>
          </p>
        )}
      </div>
    </>
  );
}
