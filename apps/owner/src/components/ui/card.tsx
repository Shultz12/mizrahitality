import * as React from 'react';

import { cn } from '@/lib/utils';

// The card surface pops off the warm cream canvas with a soft shadow + border. Its header is a
// distinct tinted band (`bg-card-header`) with a bottom border and a small terracotta accent tick
// — so headers visually separate from the body without being noisy.

function Card({
  className,
  size = 'default',
  ...props
}: React.ComponentProps<'div'> & { size?: 'default' | 'sm' }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        'group/card flex flex-col overflow-hidden rounded-xl border border-border bg-card text-sm text-card-foreground shadow-[0_1px_0_rgba(20,17,13,0.04),0_4px_12px_-2px_rgba(20,17,13,0.06)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl',
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      data-accent="true"
      className={cn(
        // Distinct tinted band + bottom border + a small leading terracotta accent tick.
        'group/card-header @container/card-header relative flex items-center gap-2.5 border-b border-border bg-card-header px-5 py-3 group-data-[size=sm]/card:px-4 has-data-[slot=card-action]:[&>[data-slot=card-title]]:flex-1',
        // The tick — purely decorative; hides when `data-accent` is explicitly set to false.
        'before:absolute before:left-4 before:top-1/2 before:hidden before:h-4 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-accent/85 before:content-[""] group-data-[size=sm]/card:before:h-3.5 [&[data-accent="true"]]:pl-7 [&[data-accent="true"]]:before:block',
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        'font-heading text-base leading-snug font-semibold tracking-tight group-data-[size=sm]/card:text-sm',
        className,
      )}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-action"
      className={cn('ml-auto flex items-center self-center', className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-content"
      className={cn(
        'px-5 py-5 group-data-[size=sm]/card:px-4 group-data-[size=sm]/card:py-4',
        className,
      )}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        'flex items-center rounded-b-xl border-t border-border bg-card-header p-4 group-data-[size=sm]/card:p-3',
        className,
      )}
      {...props}
    />
  );
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent };
