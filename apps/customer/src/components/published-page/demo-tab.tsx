// The mid-left "Preview as…" hover-out demo tab — REQ-17, and a reviewer aid only. A real visitor
// never sees this and the visitor type is never in the URL or the page UI. Server Component, no
// client JS: a fixed, always-visible vertical tab handle; on hover (and keyboard focus-within) a
// warm panel slides out via a pure-CSS transform. The panel is a `<form action={selectVisitorTypeAction}>`
// with one submit button per `allVisitorVariants()` (7) plus an `value=""` "Unknown / default"
// button — submitting sets (or clears) the `httpOnly` `miz_visitor_type` cookie and re-renders SSR
// for that variant; subsequent analytics events are tagged with it.

import { allVisitorVariants, type VisitorType } from '@mizrahitality/contracts';
import { cn } from '@/lib/utils';
import { selectVisitorTypeAction } from '@/lib/visitor-type-actions';

function variantLabel(v: VisitorType): string {
  if (v === 'neutral') return 'Neutral (default)';
  // `v` is `${gender}-${ageGroup}` here, e.g. "male-18-30" / "female-50+".
  const [gender = '', ...ageParts] = v.split('-');
  const age = ageParts.join('-').replace('-', '–'); // en-dash for ranges; "50+" untouched
  return `${gender.charAt(0).toUpperCase()}${gender.slice(1)} · ${age}`;
}

function VariantButton({
  value,
  label,
  selected,
}: {
  value: string;
  label: string;
  selected: boolean;
}) {
  return (
    <button
      type="submit"
      name="type"
      value={value}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'flex w-full items-center justify-between rounded px-3 py-2 text-left text-[13px] transition-colors',
        selected
          ? 'bg-[#E85D4A]/15 font-semibold text-[#2C2824] ring-1 ring-[#E85D4A]/50'
          : 'text-[#2C2824]/80 hover:bg-[#2C2824]/5',
      )}
    >
      <span>{label}</span>
      {selected && <span aria-hidden="true">✓</span>}
    </button>
  );
}

export function DemoTab({ current }: { current: VisitorType }) {
  return (
    <div
      className={cn(
        'group fixed left-0 top-1/2 z-[90] flex -translate-x-[17rem] -translate-y-1/2 items-stretch',
        'transition-transform duration-300 ease-out hover:translate-x-0 focus-within:translate-x-0',
      )}
    >
      {/* The sliding panel — off-screen to the left until the assembly translates back to 0. */}
      <form
        action={selectVisitorTypeAction}
        className="flex max-h-[85vh] w-[17rem] flex-col gap-1 overflow-y-auto rounded-r-lg border border-l-0 border-[#c8c7be]/40 bg-[#FAF7F2] p-3 shadow-2xl"
      >
        <p
          style={{ fontFamily: 'var(--font-playfair)' }}
          className="px-1 pb-1 text-[14px] font-semibold text-[#2C2824]"
        >
          Preview as…
        </p>
        {allVisitorVariants().map((v) => (
          <VariantButton key={v} value={v} label={variantLabel(v)} selected={v === current} />
        ))}
        <VariantButton value="" label="Unknown / default" selected={false} />
        <p className="px-1 pt-2 text-[11px] leading-[1.4] text-[#2C2824]/45">
          Reviewer aid — the real site never shows this.
        </p>
      </form>

      {/* The always-visible handle. */}
      <div
        className="flex items-center rounded-r-lg bg-[#2C2824] px-2 py-4 text-[12px] font-semibold uppercase tracking-[0.15em] text-[#FAF7F2] shadow-lg"
        style={{ writingMode: 'vertical-rl' }}
        aria-hidden="true"
      >
        Preview as…
      </div>
    </div>
  );
}
