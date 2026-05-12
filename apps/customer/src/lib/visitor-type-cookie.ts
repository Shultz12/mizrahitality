// The cookie the customer SSR reads to pick which audience variant to render. It's set ONLY by the
// mid-left "Preview as…" demo tab (`selectVisitorTypeAction`) — a reviewer aid; a real visitor
// never sees it and it's never in the URL. `httpOnly` so `document.cookie` can't read it; absent or
// unrecognised → `neutral` (REQ-18), via `parseVisitorType`.

import { cookies } from 'next/headers';
import { parseVisitorType, type VisitorType } from '@mizrahitality/contracts';

export const VISITOR_TYPE_COOKIE = 'miz_visitor_type';

/** The active visitor type for the current request — `neutral` when the cookie is absent/unknown. */
export async function readVisitorType(): Promise<VisitorType> {
  const raw = (await cookies()).get(VISITOR_TYPE_COOKIE)?.value;
  return parseVisitorType(raw);
}
