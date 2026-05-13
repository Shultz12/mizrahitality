'use server';

// Server Action behind the demo tab's `<form>`: one `<button type="submit" name="type" value=…>`
// per visitor variant (7). Sets the `httpOnly` `miz_visitor_type` cookie the customer SSR reads —
// then Next re-renders the route, so the page comes back rendered for that variant and subsequent
// analytics events are tagged with it. No client JS. The visitor type never appears in the URL.

import { cookies } from 'next/headers';
import { isVisitorType } from '@mizrahitality/contracts';
import { VISITOR_TYPE_COOKIE } from './visitor-type-cookie';

export async function selectVisitorTypeAction(formData: FormData): Promise<void> {
  const raw = formData.get('type');
  const jar = await cookies();

  if (typeof raw === 'string' && isVisitorType(raw)) {
    jar.set(VISITOR_TYPE_COOKIE, raw, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });
  } else {
    // Defensive fallback for unexpected/empty input — the SSR then falls back to `neutral`.
    jar.delete(VISITOR_TYPE_COOKIE);
  }
}
