# Plan 03 — site-builder

Build step #3 of the master plan (`plans/00-master-plan.md`). Source of truth for *what/why*: `VISION.md` + `PRD.md`. Cross-cutting decisions every feature inherits: `NOTES.md` → "Foundation decisions" — referenced, not restated.

> **First execution step:** copy this file to `plans/03-site-builder-plan.md` (so `plans/` lists in build order), then implement from there.

## 1. Context

Owner-auth (#2) landed: `Owner` / `Venue` / `Session` Prisma models with a real migration history, email+password sign-up / sign-in / sign-out over `httpOnly` cookie sessions, `lib/auth.ts` (`getCurrentOwner` wrapped in React `cache()`, `requireOwner()` → `/sign-in`, type `OwnerWithVenue = Owner & { venue: Venue | null }`), `lib/auth-actions.ts` (the Server Action + `useActionState` pattern: `type AuthState = { error?; fieldErrors?; values? }`, `redirect()` outside any try/catch), `lib/validation.ts` (pure validators + `ValidationResult`), the `(auth)` / `(authed)` route groups, and a placeholder `(authed)/dashboard/page.tsx`. The `Venue` model is deliberately minimal — `ownerId @unique` + timestamps — with content fields *reserved* for this feature.

Feature #3 is the builder: the owner's *entire* input surface. It adds the `Venue` content columns (name, slug, description, image kind+value) plus a publish-state skeleton and an empty `PageVariant` table; pure slug-derivation and venue-name validation; image-upload handling (disk storage under the owner app) and an unauthenticated serving route; a stock-image registry built on the 3 supplied images; the `(authed)/builder` page with its Server Actions; an updated dashboard that links into the builder; a small authed nav; and a preview that shows the saved inputs back. No AI (that's #4), no layout / rich-text / image-placement UI, no second venue. It unblocks #4, which fills the `PageVariant` content and the Publish action with real generation.

**Decisions pinned with the user (2026-05-12):**
- **Stock images** — the 3 real images are supplied at `images/` in the repo root (`Atlantis Paradise.jpg`, `Burj Al Arab.jpg`, `Mardan Palace.jpg`); move + rename them into `apps/owner/public/stock/` as kebab-case files and register them by stable id.
- **Slug freeze** — frozen at first publish (via `Venue.slugLockedAt`); before that, renaming re-derives the slug freely.
- **Upload storage** — files live *outside* `public/` under `apps/owner/uploads/…` and are served by an unauthenticated owner Route Handler `GET /uploads/[...path]`.
- **Variant storage** — create the empty `PageVariant` model now (`content` is `Json`, shape intentionally unmodeled until #4) plus `publishState` / `publishedAt` / `slugLockedAt` on `Venue`; the table stays empty in #3.
- **Upload constraints** (proposed default — flag at review) — accept `image/jpeg` / `image/png` / `image/webp` only, ≤ 5 MB, no resizing/cropping (no `sharp`); validate by declared `File.type` plus a magic-byte sniff; server-generated filename.

## 2. Scope

### 2.1 Prisma schema changes — via the `update-database` skill

**Edit `apps/owner/prisma/schema.prisma`** — extend `Venue`, add `PageVariant`:

```prisma
model Venue {
  id          String   @id @default(cuid())
  ownerId     String   @unique
  owner       Owner    @relation(fields: [ownerId], references: [id], onDelete: Cascade)

  // --- content (feature #3 site-builder) ---
  name        String                  // English letters + spaces; 1–60 chars (validated in app code)
  slug        String   @unique         // derived from name: lowercased, spaces removed, numeric suffix on collision
  description String   @default("")    // free text; may be empty until the owner writes it
  imageKind   String                   // 'stock' | 'upload'
  imageValue  String                   // stock: a stock-image id (e.g. 'atlantis-paradise'); upload: relative key 'venues/<venueId>/<file>'

  // --- publish-flow skeleton (#3 stub; #4 fills generation) ---
  publishState String  @default("draft")   // 'draft' | 'publishing' | 'published'
  slugLockedAt DateTime?                    // set at first publish; once set the slug is immutable
  publishedAt  DateTime?

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  variants    PageVariant[]

  @@map("venues")
}

model PageVariant {
  id          String   @id @default(cuid())
  venueId     String
  venue       Venue    @relation(fields: [venueId], references: [id], onDelete: Cascade)
  visitorType String                    // one of the 7 VisitorType values
  content     Json                      // populated-slot blob — shape intentionally unmodeled until #4 (ai-copy-and-variants)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([venueId, visitorType])
  @@index([venueId])
  @@map("page_variants")
}
```

Notes:
- All new `Venue` content columns are non-null except `description` (`@default("")`) — the venue row is created the moment the owner first submits a valid name + image; the create form requires all three. `imageKind` + `imageValue` is one pair (the kind says how to read the value), not two nullable columns.
- `slug @unique` is the DB backstop; the app derives the slug with a collision loop and catches `P2002` as a last resort.
- `PageVariant.content` is `Json` (stored as TEXT by Prisma+SQLite) and deliberately *not* given a TS shape — #4 pins the slot schema. In #3 the table is created but never written.
- `publishState` is a plain string (SQLite has no native enums) with documented values; owner-internal — not promoted to `@mizrahitality/contracts`.

**`update-database` workflow** (run from `apps/owner/`; ignore the skill's `backend/...` paths and its `organizationId` multi-tenancy guidance — Prisma is at `apps/owner/prisma/`, tenancy is per-`Owner`; skip the orchestrator `/tmp` completion-gate echo):
1. Edit `schema.prisma` (above).
2. `npx prisma validate`.
3. `npx prisma migrate dev --name add-venue-content-and-page-variant` — the second real migration. Adding non-null columns to `venues` is effectively non-destructive (the builder doesn't exist yet, so `venues` is empty in any real DB). If `migrate dev` balks on the new non-null columns, wipe the disposable `apps/owner/prisma/dev.db*` and re-run — don't add throwaway `@default`s.
4. `npx prisma generate`.
5. Prepend an `apps/owner/prisma/CHANGELOG.md` entry — date `12-05-2026` (or current), migration `add-venue-content-and-page-variant`, feature #3; list the new `Venue` columns + the `PageVariant` model; note "`PageVariant.content` is `Json`, shape TBD by #4 — table empty until then", "slug frozen at first publish via `slugLockedAt`", and the "if `migrate dev` balks, `venues` is empty in practice — wipe `dev.db` and re-run" caveat.
6. `pnpm --filter mizrahitality-owner build` + `typecheck` + `pnpm lint`.

(`apps/owner/vitest.global-setup.ts` runs `prisma db push` against the throwaway DB and reads the current schema, so it picks up the new tables automatically — no change there.)

### 2.2 Stock images — move the supplied assets in

- Create `apps/owner/public/stock/` and move the 3 supplied images there with kebab-case names: `images/Atlantis Paradise.jpg` → `apps/owner/public/stock/atlantis-paradise.jpg`; `images/Burj Al Arab.jpg` → `apps/owner/public/stock/burj-al-arab.jpg`; `images/Mardan Palace.jpg` → `apps/owner/public/stock/mardan-palace.jpg`. Remove the now-empty `images/` dir from the repo root.
- These are committed app assets (not user data), so `public/stock/*` stays in git.

### 2.3 Contracts additions — `@mizrahitality/contracts`

**None.** Image kinds and publish state are owner-internal; the rendered-page DTO is #5's, the slot schema #4's. (`SLOT_TYPES` already exists as the placeholder.)

### 2.4 `apps/owner/src/lib/` — new / extended modules

**`slug.ts`** (new — pure, no Next/Prisma imports; unit-tested):
- `deriveSlugBase(name: string): string` — lowercase the (already-validated) name and strip all whitespace; defensively strip anything non-`[a-z]`. `"Blue Lagoon"` → `"bluelagoon"`.
- `nextAvailableSlug(base: string, isTaken: (slug: string) => Promise<boolean>): Promise<string>` — try `base`, then `base2`, `base3`, … until one's free; return it. `isTaken` is injected so the function stays unit-testable; the rename case passes an `isTaken` that excludes the venue's own current slug.

**`validation.ts`** (extend the existing pure module):
- Constants `VENUE_NAME_MIN_LENGTH = 1`, `VENUE_NAME_MAX_LENGTH = 60`, `VENUE_DESCRIPTION_MAX_LENGTH = 5000`.
- `normalizeVenueName(raw): string` — `trim()` then collapse internal whitespace runs to single ASCII spaces.
- `validateVenueName(raw): ValidationResult` — normalize; required (`"Venue name is required."`); ≤ 60 (`"Venue name is too long (max 60 characters)."`); must match `/^[A-Za-z]+( [A-Za-z]+)*$/` else `"Venue name can only contain English letters and spaces — no numbers, punctuation, or accented characters."`.
- `validateVenueDescription(raw): ValidationResult` — `trim()`; allow empty; reject > 5000 chars; return the trimmed value.

**`stock-images.ts`** (new — pure data + helpers):
- `STOCK_IMAGES`: a frozen array of `{ id; label; path }` — `{ id: 'atlantis-paradise', label: 'Atlantis Paradise', path: '/stock/atlantis-paradise.jpg' }`, `{ id: 'burj-al-arab', label: 'Burj Al Arab', path: '/stock/burj-al-arab.jpg' }`, `{ id: 'mardan-palace', label: 'Mardan Palace', path: '/stock/mardan-palace.jpg' }`.
- `STOCK_IMAGE_IDS` (`as const`) + `type StockImageId`; `isStockImageId(value: unknown): value is StockImageId`; `stockImagePath(id: StockImageId): string`.

**`uploads.ts`** (new — server-only: `node:fs/promises`, `node:path`, `node:crypto`):
- `UPLOADS_ROOT` — absolute path to `apps/owner/uploads` (resolved from `process.cwd()`; document the assumption that Next runs with cwd = the app dir).
- `ALLOWED_UPLOAD_MIME = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const`; `MAX_UPLOAD_BYTES = 5 * 1024 * 1024`.
- `sniffImageMime(bytes: Uint8Array): keyof typeof ALLOWED_UPLOAD_MIME | null` — magic-byte check (JPEG `FF D8 FF`, PNG `89 50 4E 47`, WebP `RIFF…WEBP`).
- `saveVenueUpload(venueId: string, file: File, opts?: { rootOverride?: string }): Promise<{ key: string }>` — reject `file.size > MAX_UPLOAD_BYTES`; read bytes; `sniffImageMime` must succeed and be consistent with `file.type`; `mkdir -p uploads/venues/<venueId>`; write `<crypto.randomBytes(16).toString('hex')>.<ext>`; return `{ key: 'venues/<venueId>/<file>' }`. (`rootOverride` exists for the tmpdir-based test.)
- `resolveUploadPath(key: string): string | null` — join `UPLOADS_ROOT` + key, `path.resolve`, verify the result is still inside `UPLOADS_ROOT` (path-traversal guard); return the absolute path or `null`.
- `contentTypeForKey(key: string): string` — map the extension back to a MIME type (default `application/octet-stream`).
- `deleteUploadByKey(key: string): Promise<void>` — best-effort `unlink` of a previous upload when the owner switches images; wrap in try/catch, ignore failures (orphans are acceptable at demo scale).

**`builder-actions.ts`** (new — `'use server'`; thin orchestration over `auth.ts` + `validation.ts` + `slug.ts` + `uploads.ts` + `stock-images.ts` + Prisma; not unit-tested — covered by helper integration tests + the manual click-through):
- `type BuilderState = { error?: string; fieldErrors?: { name?: string; description?: string; image?: string }; values?: { name?: string; description?: string }; ok?: boolean }` — mirrors `AuthState`'s shape; `ok: true` on a successful save (the form shows "Saved." and `router.refresh()`es so the Server-Component preview re-renders).
- `saveVenueAction(_prev: BuilderState, formData: FormData): Promise<BuilderState>` — `const owner = await requireOwner()`. Parse `name`, `description`, `imageMode` (`'stock' | 'upload' | 'keep'`), `stockImageId` (when mode=stock), `imageFile` (`formData.get('imageFile')` as `File` when mode=upload). Validate name + description (collect `fieldErrors`); validate the image choice (`stock` → `isStockImageId(stockImageId)` else `fieldErrors.image`; `upload` → a `File` with `size > 0` else `fieldErrors.image`; `keep` → only valid if the owner already has an `upload`-kind image). If any `fieldErrors` → return `{ fieldErrors, values: { name, description } }`.
  - **No venue yet (`!owner.venue`)** — `keep` is invalid here (`fieldErrors.image`). Derive `slugBase = deriveSlugBase(name)`; `slug = await nextAvailableSlug(slugBase, s => prisma.venue.findUnique({ where: { slug: s }, select: { id: true } }).then(Boolean))`. Create the venue with the resolved name/slug/description and image fields set to the stock pick — or, for an upload, create first with a temporary placeholder, then `const { key } = await saveVenueUpload(venue.id, file); await prisma.venue.update({ where: { id: venue.id }, data: { imageKind: 'upload', imageValue: key } })`. Catch `P2002` on `slug` and retry once with a bumped suffix. Return `{ ok: true }`.
  - **Has a venue** — if `owner.venue.slugLockedAt == null` and the name changed → re-derive the slug (`nextAvailableSlug` with this venue's own current slug excluded from "taken"); if `slugLockedAt != null` → keep the existing slug regardless of the name. Update `name` + `description`. Image: `stock` → `imageKind:'stock', imageValue: stockImageId` (and `deleteUploadByKey` the old value if the old kind was `upload`); `upload` → `saveVenueUpload` → update + `deleteUploadByKey(old)` if old kind was `upload`; `keep` → leave image fields untouched. Return `{ ok: true }`.
- `publishAction(): Promise<void>` — `const owner = await requireOwner()`; if `!owner.venue` → `redirect('/builder')`. **Stub for #3:** `prisma.venue.update({ where: { id: owner.venue.id }, data: { publishState: 'published', publishedAt: new Date(), slugLockedAt: owner.venue.slugLockedAt ?? new Date() } })` — freeze the slug now; **do not** generate variants — leave `// TODO(feature #4 ai-copy-and-variants): generate + structurally validate the 7 PageVariant rows here before flipping publishState.` Then `redirect('/builder?published=1')`. `redirect()` is outside any try/catch.

> **No-JS note** (carried from #2): the `<form action>` posts without JS, but `useActionState`'s returned state (field errors, "Saved.") needs hydration. Acceptable for a localhost demo; noted as a known limitation.

### 2.5 `apps/owner/src/app/` — routes

- **`(authed)/builder/page.tsx`** — Server Component: `const owner = await requireOwner()`; reads `searchParams.published` for the post-publish banner. Renders `<BuilderForm venue={owner.venue} />` + `<VenuePreview venue={owner.venue} />` (stacked on small screens, side-by-side on wide), plus the publish section — `<form action={publishAction}><Button>{owner.venue?.publishState === 'published' ? 'Re-publish' : 'Publish'}</Button></form>` with a note that audience-tailored generation lands in #4, the button disabled when `!owner.venue`. The slug line: "Your page address: `/<slug>`" — "(fixed once published)" when `slugLockedAt` is set, "(updates when you rename)" when not, "(created when you save)" when no venue yet.
- **`uploads/[...path]/route.ts`** — a Route Handler `GET(req, { params })`: `await params` → join `params.path` → `resolveUploadPath`; if `null` or the file doesn't exist → `new NextResponse('Not found', { status: 404 })`; else `fs.readFile` → `new NextResponse(buf, { headers: { 'Content-Type': contentTypeForKey(key), 'Cache-Control': 'private, max-age=60' } })`. Lives at `app/uploads/[...path]/route.ts` — *outside* the `(authed)` group, deliberately **unauthenticated** (the public customer page loads these images; keys are random). Doc-comment that. (`/uploads/...` and `public/`'s `/stock/...` don't collide.)
- **`(authed)/dashboard/page.tsx`** — replace the placeholder body: `const owner = await requireOwner()`; greeting "Welcome, {owner.email}"; a "Your venue" `Card` — if `!owner.venue`: "You haven't created your venue yet." + a primary `<Link href="/builder" className={buttonVariants()}>Create your venue</Link>`; else: the name, slug, `publishState`, a thumbnail, and an "Edit in the builder" link; an "Analytics" `Card` — "Your dashboard arrives in feature #7." The standalone "Sign out" form moves to the authed nav (below).
- **`(authed)/layout.tsx`** — add a small `<header>` (flex row): `Mizrahitality` wordmark + `Dashboard` / `Builder` links (`buttonVariants({ variant: 'ghost' })`) + a `<form action={signOutAction}>` sign-out button — so both dashboard and builder get nav for free. Keep the existing content wrapper.
- **`app/page.tsx`** (`/` landing) — when authed, keep "Go to your dashboard" and add "Open the builder" → `/builder`. Otherwise unchanged.

### 2.6 `apps/owner/src/components/` — UI

shadcn components to add (from `apps/owner/`, `npx shadcn@latest add <name>` — `shadcn@4.x`, Base-UI; `components.json` is configured):
- **`textarea`** → `components/ui/textarea.tsx` (description).
- **`card`** → `components/ui/card.tsx` (`Card` / `CardHeader` / `CardTitle` / `CardDescription` / `CardContent` / `CardFooter`).
- **`radio-group`** → `components/ui/radio-group.tsx` — for the stock-vs-upload toggle and the 3-stock picker. If the Base-UI radio primitive is awkward, fall back to plain Tailwind-styled `<input type="radio">` (no extra dep) — decide at implementation time.
- Skip any `form`/`field` primitive — `useActionState` + manual `<p className="text-sm text-destructive">` is the established pattern. (`button`, `input`, `label` already present.)

New components:
- **`components/builder/builder-form.tsx`** — `'use client'`, `useActionState(saveVenueAction, {})`. Props: `venue: { name; slug; description; imageKind; imageValue; slugLockedAt: Date | null } | null` (the page passes `owner.venue` or `null`).
  - **Name**: `<Label>` + `<Input name="name" defaultValue={state.values?.name ?? venue?.name ?? ''}>`, helper "English letters and spaces only", error `<p>` from `state.fieldErrors?.name`, `aria-invalid`/`aria-describedby` like the auth forms.
  - **Slug preview**: a read-only line. When `venue` exists, show `venue.slug` + "(fixed once published)" / "(updates when you rename)" by `venue.slugLockedAt`. When no venue, live-derive a *preview* from the typed name via the pure `deriveSlugBase` (imported from `@/lib/slug` — no server deps), labelled "(created when you save)".
  - **Description**: `<Label>` + `<Textarea name="description" rows={6} defaultValue={state.values?.description ?? venue?.description ?? ''}>`, error `<p>`.
  - **Image**: `<ImagePicker current={venue ? { kind: venue.imageKind, value: venue.imageValue } : null} />` (own component). Error `<p>` from `state.fieldErrors?.image`.
  - **Submit**: `<Button type="submit" disabled={pending}>{pending ? 'Saving…' : (venue ? 'Save changes' : 'Create venue')}</Button>`; `state.ok && <p role="status">Saved.</p>` (and `useEffect(() => { if (state.ok) router.refresh(); }, [state.ok])` via `useRouter` from `next/navigation` so the preview re-renders); `state.error && <p role="alert">…</p>`.
  - The `<form action={formAction} noValidate encType="multipart/form-data">` — `encType` matters for the upload.
- **`components/builder/image-picker.tsx`** — `'use client'`. Local state: `mode: 'stock' | 'upload'` (init from `current?.kind`, default `'stock'`), `stockImageId` (init from `current` if it's a stock id, else `STOCK_IMAGE_IDS[0]`), `pickedFileName | null`. Renders:
  - A two-option radio: "Choose a stock photo" / "Upload your own".
  - **Stock mode**: a small grid of the 3 `STOCK_IMAGES` — each a clickable `<label>` wrapping a hidden radio + an `<img src={path}>` with a selected ring. Emits `<input type="hidden" name="imageMode" value="stock">` + `<input type="hidden" name="stockImageId" value={stockImageId}>`.
  - **Upload mode**: `<input type="file" name="imageFile" accept="image/jpeg,image/png,image/webp">` + a note "JPEG, PNG, or WebP, up to 5 MB". If no file is picked yet *and* `current?.kind === 'upload'` → emit `<input type="hidden" name="imageMode" value="keep">` (keep the existing file); once a file is picked → `value="upload"`. Show the current image (`<img src={current.kind === 'upload' ? '/uploads/' + current.value : stockImagePath(current.value)}>`) as "current photo" when `current` exists.
  - Imports `STOCK_IMAGES` / `STOCK_IMAGE_IDS` / `stockImagePath` from `@/lib/stock-images` (pure — fine in a client component).
- **`components/builder/venue-preview.tsx`** — a Server Component (no interactivity): props `venue: { name; slug; description; imageKind; imageValue } | null`. A `Card` titled "Preview": the name as a heading; `/{slug}` muted; the image (`/uploads/<key>` or `/stock/...`) — use a plain `<img>` (Next `<Image>` would need config for the dynamic `/uploads` route; ESLint `@next/next/no-img-element` is a warning, not an error here, and the root config doesn't escalate it — confirm during implementation, else add a scoped disable); the description as `<p className="whitespace-pre-wrap">` (free text, line breaks preserved). A note: "This is a plain preview of your inputs — your AI-generated, audience-tailored page arrives with feature #4." When `!venue` → "Nothing to preview yet — fill in the form and save." Reflects the **saved** venue (REQ-4's "preview reflects the current content" = persisted content); the form's `router.refresh()` after a save updates it.

### 2.7 Disk layout / `.gitignore`

- `apps/owner/public/stock/` — committed; holds the 3 supplied images (kebab-case names, §2.2).
- `apps/owner/uploads/` — the upload destination root; **not committed**; `saveVenueUpload` `mkdir -p`s `uploads/venues/<venueId>/` on demand (no `.gitkeep`).
- `.gitignore` — add:
  ```
  # Uploaded venue images (served by the owner app at /uploads/...)
  apps/owner/uploads/
  ```

### 2.8 Tests — `apps/owner/src/__tests__/`

Unit (pure, no DB):
- **`slug.test.ts`** — `deriveSlugBase('Blue Lagoon')` → `'bluelagoon'`; lowercases; strips defensive non-letters; `nextAvailableSlug('cafe', stub)` where the stub says `cafe` + `cafe2` are taken → `'cafe3'`; nothing taken → `'cafe'`; rename case (stub excludes the venue's own slug) → no suffix bump.
- **`venue-validation.test.ts`** (new, or extend `validation.test.ts`) — `validateVenueName` accepts `'Blue Lagoon'`, `'Cafe'`; rejects `''`, `'   '`, `'Cafe 2'`, `'Café'`, `'Bar & Grill'`, `'😀'`; collapses internal whitespace (`'Blue   Lagoon'` → ok, value `'Blue Lagoon'`); rejects > 60 chars. `validateVenueDescription` accepts empty, accepts ≤ 5000, rejects > 5000, trims.
- **`uploads.test.ts`** — `sniffImageMime` recognizes JPEG/PNG/WebP magic bytes, returns `null` for a text blob; `resolveUploadPath` rejects `'../../../etc/passwd'` and `'venues/x/../../escape'` (→ `null`), accepts `'venues/abc/def.jpg'`; `contentTypeForKey` maps extensions; `saveVenueUpload` (with a `rootOverride` pointing at `os.tmpdir()`) writes a `venues/<id>/<file>.jpg` key, the file exists with matching bytes, rejects an oversized buffer, rejects a non-image buffer — clean up the tmp dir in `afterAll`.
- **`stock-images.test.ts`** — `STOCK_IMAGES` has length 3, unique ids matching the 3 filenames; `isStockImageId` true for the 3, false otherwise; `stockImagePath` returns a `/stock/...` path that matches a file present under `apps/owner/public/stock/` (fs check).

Integration (temp SQLite via the existing `vitest.config.ts` + `vitest.global-setup.ts`, which now provisions the new tables automatically):
- **`builder.integration.test.ts`** — exercises the persistence layer the way the actions do, without invoking the actions (which need a request context for `cookies()`):
  - Create an `Owner` + a `Venue` with a derived slug + a stock image → `prisma.owner.findUnique({ include: { venue: true } })` round-trips name/slug/description/imageKind/imageValue/`publishState: 'draft'`.
  - **Slug collision** — venue A named `'Cafe'` → slug `'cafe'`; for venue B (different owner, same name) `nextAvailableSlug('cafe', isTakenAgainstDB)` → `'cafe2'`; create B; a direct third `create` with `slug:'cafe'` throws `P2002`.
  - **Image-kind switching** — `update` a venue from `{imageKind:'stock', imageValue:'atlantis-paradise'}` to `{imageKind:'upload', imageValue:'venues/<id>/x.jpg'}` and back to a different stock id; re-read each time.
  - **Publish stub** — `update` `publishState:'published'`, `publishedAt`, `slugLockedAt`; re-read → set; `page_variants` still empty. Helper-level: `nextAvailableSlug` is only called when `slugLockedAt == null` — test both branches.
  - **No-leak** — `prisma.owner.findUnique({ where: { id: B.id }, include: { venue: true } })` never returns A's venue (mechanizes REQ-22 at the venue level).

(The Server Actions stay thin and are exercised by the manual click-through, same as `auth-actions.ts`.)

### 2.9 Doc upkeep (part of this feature)

- `apps/owner/prisma/CHANGELOG.md` — the new migration entry (§2.1).
- `apps/owner/prisma/schema.prisma` — update the top-of-file / `Venue` comment ("content fields land in #3" → "content + publish skeleton landed in #3; `PageVariant.content` shape TBD by #4").
- `NOTES.md`:
  - "Build order" — tick row #3 `site-builder ✅` (one-liner + `plans/03-site-builder-plan.md`).
  - "Open / pending" — replace the "#3 next" expectations with a "landed" note; record resolved decisions: **slug frozen at first publish** (`Venue.slugLockedAt`); **upload constraints** = JPEG/PNG/WebP, ≤ 5 MB, no resizing, magic-byte + declared-type check, server-generated filename; **uploads at `apps/owner/uploads/venues/<venueId>/<random>.<ext>`** (gitignored, `mkdir -p` on demand, outside `public/` and the build), persisted as a relative key, served by the unauthenticated owner Route Handler `GET /uploads/[...path]`; **`PageVariant` model created now, empty until #4** — `content` is `Json`, shape TBD; **no `@mizrahitality/contracts` additions** in #3; **3 supplied stock images** moved to `apps/owner/public/stock/{atlantis-paradise,burj-al-arab,mardan-palace}.jpg`, registered by stable id in `lib/stock-images.ts`; **venue name** = English letters + spaces, 1–60 chars, internal whitespace collapsed; **follow-up**: #5/#6 will need an owner public base URL to compose absolute image URLs into the API payload. Mark the "Slug derivation details" open question resolved.
  - "Foundation decisions" — optionally append to the "Image input" bullet: "uploads served via `GET /uploads/[...path]` in the owner app; persisted as a relative key".
- `CLAUDE.md` — "Build / run / test": note `apps/owner/uploads/` (gitignored, created on demand) holds uploaded venue images; the second migration lives in `apps/owner/prisma/migrations/`. Update the status blurb ("owner authentication … the venue builder … arrive with later features" → "owner-auth + the site builder landed (#2/#3); the AI publish steps, the REST API, and the dashboard arrive with later features"). "Conventions" → "Owner-app routes": add `(authed)/builder` is the venue builder; `app/uploads/[...path]` is an *unauthenticated* Route Handler streaming uploaded venue images (deliberately outside `(authed)` so the public customer page can load them).
- `README.md` — status blurb: tick the builder. "Setup & run": a one-line note that uploaded images go to `apps/owner/uploads/` (gitignored). (`pnpm db:migrate` already covers the new migration.)

## 3. Out of scope

- No layout editor, no rich-text editor, no image-placement UI, no drag-and-drop, no other content controls — exactly three inputs (name, description, image).
- No AI — no description enhancement, no variant generation; "Publish" only flips `publishState` + freezes the slug. `PageVariant` is created but never written.
- No second venue / no venue selector — `Venue.ownerId @unique`; one builder, one venue (REQ-22).
- No image processing — no resize/crop/optimize, no `sharp`; uploads stored as-is.
- No `@mizrahitality/contracts` additions — the rendered-page DTO is #5's, the slot schema #4's; image kinds are owner-internal.
- No absolute-URL composition for the customer payload — there's no API yet; #5/#6 do that (and may add an owner public-base-URL env var then).
- No auth on `/uploads/[...path]` — deliberately public (the customer page loads these images); keys are random; path-traversal-guarded.
- No no-JS form-error fallback — known limitation, carried from #2.

## 4. Dependencies

- *Build-order:* feature #2 (owner-auth) — landed.
- *Supplied assets:* the **3 stock images** — supplied (`images/` at the repo root); moved to `apps/owner/public/stock/` (§2.2). The supplied builder UI: not landed — ship plain Tailwind + shadcn (`Button` / `Input` / `Label` / `Textarea` / `Card` / `RadioGroup`), refined under REQ-11 later.
- *External:* nothing new in `.env` (`DATABASE_URL` + `SESSION_SECRET` already required; `ANTHROPIC_API_KEY` still a #4 placeholder).
- *New npm deps:* none beyond shadcn-added components (which only pull in already-present primitives). No `sharp`, no `formidable`/`multer` (Next's built-in `FormData`/`File` handles uploads in Server Actions), no `slugify` (the rule is trivial and we want it pure + testable).

## 5. Contracts additions

**None.** Builder shapes (image kinds, publish state, the `PageVariant.content` blob) are owner-internal in #3, just as auth shapes were in #2. The rendered-page DTO lands in #5 (`published-page-ssr`), the slot schema in #4 (`ai-copy-and-variants`).

## 6. PRD requirements satisfied

- **REQ-4** (description-driven site builder) — the builder with exactly three inputs (venue name with English-letters-only validation + a derived slug shown to the owner; free-text description; one image, uploaded or picked from the 3 stock images, changeable later); inputs persist on `Venue`; a preview reflects the saved content; no other content controls.
- **REQ-22** (one venue per owner) — `Venue.ownerId @unique`; one builder, no selector; the builder operates on the authenticated owner's own venue only; an integration test mechanizes the no-leak.
- **REQ-12** (edit and re-publish) — *partial*: editing the name/description/image and re-saving persists; the slug-freeze-at-publish rule is in place; re-publish is the stub (variant regeneration is #4).
- **REQ-7** (SSR published page) — *foundation only*: the `publishState` / `PageVariant` / `publishedAt` / `slugLockedAt` storage shape exists; the SSR page itself is #5.
- **REQ-11** (friendly owner UI) — *partial*: builder + updated dashboard + authed nav in plain Tailwind + shadcn with labels / focusable inputs / `aria-invalid` / clear errors; refined when supplied designs land.

## 7. Open questions to pin (resolved in this plan)

- **Slug freeze policy** → **frozen at first publish** (`Venue.slugLockedAt`); before that, renaming re-derives freely (with numeric-suffix collision handling); after, the slug is immutable and shown read-only. *(Confirmed with the user, 2026-05-12.)*
- **Upload constraints** → `image/jpeg` / `image/png` / `image/webp`; ≤ **5 MB**; magic-byte + declared-type check; **no** dimension validation or resizing; server-generated filename. *(Proposed default — flag at review if resizing is wanted.)*
- **Where uploads live + the serving route** → `apps/owner/uploads/venues/<venueId>/<random>.<ext>` (gitignored, `mkdir -p` on demand, *outside* `public/` and the build), persisted as the relative key `venues/<venueId>/<file>`; served by an *unauthenticated* Route Handler `GET /uploads/[...path]` with a path-traversal guard. The customer's absolute URL is composed by #5/#6 — not in #3. *(Confirmed with the user.)*
- **`Page`/variant DTO — contracts or owner-internal?** → **owner-internal**, skeleton only: a `PageVariant` model (`venueId`, `visitorType`, `content Json`, `@@unique([venueId, visitorType])`), created but empty; `content`'s shape intentionally unmodeled until #4; `Venue.publishState` / `publishedAt` / `slugLockedAt` track the publish lifecycle. Nothing into `@mizrahitality/contracts`. *(Confirmed with the user.)*
- **Stock images** → the 3 supplied images moved to `apps/owner/public/stock/{atlantis-paradise,burj-al-arab,mardan-palace}.jpg`, registered by stable id in `lib/stock-images.ts`. *(Confirmed with the user — supplied in `images/`.)*
- **Venue-name validation specifics** → `trim()` + collapse internal whitespace; `^[A-Za-z]+( [A-Za-z]+)*$`; 1–60 chars; a clear rejection message naming what's allowed.
- **Live vs saved preview** → the preview reflects the **saved** venue (a Server Component); the form `router.refresh()`es after a successful save; a client-side *slug preview* updates as the owner types (via the pure `deriveSlugBase`).
- **Publish transport** → a Server Action `publishAction` invoked from a `<form action>` button on the builder page (matches the #2 auth pattern); not a `/publish` route.

## 8. Verification

**Build / static (from repo root):**
1. `pnpm install` — owner `postinstall` `prisma generate` is clean with the new `Venue` columns + `PageVariant`.
2. `pnpm --filter mizrahitality-owner exec prisma validate` — OK; inspect `apps/owner/prisma/migrations/<ts>_add_venue_content_and_page_variant/migration.sql` for the new `venues` columns and the `page_variants` table + its unique index.
3. `pnpm typecheck` — green (strict, no `any`, `noUncheckedIndexedAccess`).
4. `pnpm lint` — green.
5. `pnpm test` — green; includes `slug.test.ts`, `venue-validation.test.ts`, `uploads.test.ts`, `stock-images.test.ts`, `builder.integration.test.ts` — none touch `apps/owner/prisma/dev.db` or the real `uploads/` dir (the upload test uses a tmpdir override).
6. `pnpm build` — both apps build (the owner build compiles `lib/uploads.ts`, `lib/builder-actions.ts`, `app/uploads/[...path]/route.ts`).

**DB:**
7. `pnpm db:migrate` applies cleanly to a fresh DB; if it warns about non-null columns on `venues`, wipe `apps/owner/prisma/dev.db*` and re-run (documented in the changelog).

**Manual click-through (`pnpm dev`, owner on `http://localhost:5111`):**
8. Sign in (or sign up). `/dashboard` → "Your venue" card says "You haven't created your venue yet." with a "Create your venue" button → `/builder`. The authed nav (Dashboard / Builder / Sign out) shows on both pages.
9. `/builder`, no venue: empty name/description, the image picker (stock mode, 3 photos), slug line "(created when you save)". Submit empty name → "Venue name is required."; `Cafe 2` → the English-letters-only message; `Bar & Grill` → same; `Blue Lagoon` + a description + a stock image → saves; the preview re-renders showing the name, `/bluelagoon`, the chosen photo, the description; "Saved." appears.
10. Reload `/builder` → values persist; slug line now shows `/bluelagoon` "(updates when you rename)".
11. Rename to `Cafe`, save → slug becomes `/cafe` (re-derived; not yet published). In a second browser profile, sign up owner #2, create a venue also named `Cafe` → slug `/cafe2`. `pnpm db:studio` → two `venues` rows, slugs `cafe` and `cafe2`.
12. Switch the picker to "Upload your own", pick a small JPEG → saves; preview shows it; the `<img>` loads from `/uploads/venues/<venueId>/<file>.jpg` (200, correct `Content-Type`); the file exists under `apps/owner/uploads/venues/<venueId>/`. Upload a 6 MB file → clear "too large" error; a `.txt` renamed to `.jpg` → clear "not a supported image" error.
13. Switch back to a stock image, save → the preview switches; the old uploaded file is best-effort deleted (verify it's gone, or accept an orphan).
14. Click **Publish** → redirected to `/builder?published=1`; banner: "Published — your audience-tailored pages are generated in feature #4." `pnpm db:studio` → that venue's `publishState = 'published'`, `publishedAt` set, `slugLockedAt` set; `page_variants` is empty. Rename the venue and save → the slug **does not change** (frozen); the slug line shows "(fixed once published)".
15. `/dashboard` → "Your venue" card shows the name, slug, `published`, a thumbnail, and an "Edit in the builder" link.
16. `/builder` while signed out → redirected to `/sign-in` (the `(authed)` guard holds). `/uploads/venues/<venueId>/<file>.jpg` while signed out → still loads (public, by design). `/uploads/../../etc/passwd` (URL-encoded traversal) → 404.
17. **No-leak:** owner #2's `/builder` and `/dashboard` only ever show owner #2's venue.

**Docs:** `prisma/CHANGELOG.md` has the new entry; `NOTES.md` "Build order" has #3 ticked and the resolved decisions recorded; `CLAUDE.md` / `README.md` status blurbs updated; this plan copied to `plans/03-site-builder-plan.md`.

---

### Critical files (to create / modify)

- `apps/owner/prisma/schema.prisma` — add `Venue` content columns + publish-state fields + the `PageVariant` model (drives the migration).
- `apps/owner/src/lib/builder-actions.ts` *(new)* — `saveVenueAction` / `publishAction`; the orchestration spine.
- `apps/owner/src/lib/uploads.ts` *(new)* — disk layout, MIME/size validation, path-traversal-safe resolution (the riskiest new code).
- `apps/owner/src/lib/slug.ts` *(new)* — `deriveSlugBase` / `nextAvailableSlug` (pure, testable).
- `apps/owner/src/lib/stock-images.ts` *(new)* — the 3-image registry.
- `apps/owner/src/lib/validation.ts` — extend with `validateVenueName` / `validateVenueDescription`.
- `apps/owner/src/app/(authed)/builder/page.tsx` *(new)* — the builder page (form + preview + publish).
- `apps/owner/src/app/uploads/[...path]/route.ts` *(new)* — the unauthenticated image-serving handler.
- `apps/owner/src/app/(authed)/layout.tsx` — add the authed nav header.
- `apps/owner/src/app/(authed)/dashboard/page.tsx` — replace the placeholder with the venue + analytics cards.
- `apps/owner/src/components/builder/builder-form.tsx`, `image-picker.tsx`, `venue-preview.tsx` *(new)*.
- `apps/owner/src/components/ui/{textarea,card,radio-group}.tsx` *(new — via `npx shadcn add`)*.
- `apps/owner/public/stock/{atlantis-paradise,burj-al-arab,mardan-palace}.jpg` *(moved from `images/`)*.
- `.gitignore` — add `apps/owner/uploads/`.
- Tests: `apps/owner/src/__tests__/{slug,venue-validation,uploads,stock-images}.test.ts`, `builder.integration.test.ts` *(new)*.
- Docs: `apps/owner/prisma/CHANGELOG.md`, `NOTES.md`, `CLAUDE.md`, `README.md`.

Mirror the existing patterns: `apps/owner/src/lib/auth-actions.ts` (Server Action + `useActionState` + `redirect`-outside-try/catch), `apps/owner/src/lib/validation.ts` (pure validators), `apps/owner/src/components/auth/sign-up-form.tsx` (form component shape), `apps/owner/vitest.{config,global-setup}.ts` (test DB provisioning — picks up the new tables automatically).
