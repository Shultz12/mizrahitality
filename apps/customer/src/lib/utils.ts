// `cn` — merge conditional class names then dedupe conflicting Tailwind utilities. Mirrors
// `apps/owner/src/lib/utils.ts` so the ported published-page components keep the same idiom.

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
