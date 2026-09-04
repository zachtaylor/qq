# qq

A quotation-sharing app: like quotes, browse trending, browse by subject tag,
read author profiles, get a daily local notification with a random quote.

## Stack & why

- **SvelteKit**, static adapter (`adapter-static`, `fallback: index.html`),
  SSR off (`export const ssr = false` in root `+layout.ts`) — the whole app
  is a client-side SPA because Capacitor just serves a static bundle from
  the device; there's no server runtime at all in production.
- **TailwindCSS 4** via `@tailwindcss/vite` — utility classes only, no
  component library.
- **Capacitor** — wraps the SvelteKit static build for both Android and
  iOS. Both `/android` and `/ios` are tracked in git, not gitignored or
  regenerated on demand.
- **Supabase** — Postgres + auth + RLS + Edge Functions + pg_cron. Chosen
  over Firebase/local-only because likes/trending need a shared backend
  across users, and Postgres RLS makes "everyone reads, nobody but the
  system writes content" easy to enforce declaratively (see RLS model
  below).
- **Capacitor Local Notifications** (not push/FCM) for the daily quote —
  no server-side push infra needed, works fully offline once scheduled.

## Content model — system-managed, not user-submitted

Users do **not** submit quotes, authors, or tags. All content is populated
by a scheduled ingestion job. The _only_ thing a user can write is their
own like.

- `authors`, `quotes`, `tags`, `quote_tags` — publicly readable, writable
  only by the `service_role` (RLS has no authenticated-insert policy on any
  of them).
- `likes` — publicly readable; writable as either a device (unverifiable,
  open write) or a signed-in account (`user_id = auth.uid()`, real
  ownership) — see Auth below.
- There is no `/submit` route and no `submitted_by` column. If either
  reappears, that's scope creep — check before adding a "let users
  contribute a quote" feature.

### Where quotes come from

[ZenQuotes](https://zenquotes.io) free API. Verified directly (curl) that:

- `/api/quotes` returns ~50 _random_ quotes per call, no bulk/paginated
  export exists.
- No category/tag/subject field in the response (`q`, `a`, `c`, `h` only)
  — so ingested quotes land **untagged**. Tags are a separate curation
  concern; only the seed data has tags right now (`supabase/seed.sql` calls
  `add_quote_tags` after inserting).
- Free tier is roughly 5 req/30s — the ingestion function paces itself
  (`BATCHES_PER_RUN = 3`, `DELAY_MS = 4000` in
  `supabase/functions/ingest-zenquotes/index.ts`).

Because there's no bulk export, the design is: **run the ingestion function
repeatedly over time and let the `unique (author_id, text)` constraint (via
`upsert ... ignoreDuplicates`) dedupe**. It's scheduled hourly via
`pg_cron`/`pg_net` (see `supabase/cron.sql`), offset to `:17` past the hour.
One run currently nets ~50 new quotes (some are re-rolls that get skipped as
dupes).

## Data model

```
authors  (id, name, slug, bio, portrait_url, born_year, died_year)
quotes   (id, text, author_id → authors, source, downloads_count, unique(author_id, text))
likes    (id, device_id?, user_id? → auth.users, quote_id → quotes, exactly one of device_id/user_id)
profiles (id, device_id?, user_id? → auth.users, downloads_count, exactly one of device_id/user_id)
tags     (id, name, slug)
quote_tags (quote_id → quotes, tag_id → tags, pk both)
quote_of_the_day (date pk, quote_id → quotes) — persisted (date -> quote)
  pairing, assigned once via ensure_quote_of_the_day() (cron-only, see
  RPCs below) and never recomputed. Publicly readable; clients select it
  directly, no RPC involved. Mirrored into the on-device SQLite cache
  (see localdb.ts) so past days never need a network round-trip.
```

Key RPCs (all in `supabase/schema.sql`):

- `trending_quotes(max_rows)` — likes in the last 7 days, ranked. Public
  execute.
- `get_or_create_author(name)` — find-or-create with slug collision
  handling. **service_role only.**
- `add_quote_tags(quote_id, tag_names[])` — find-or-create tags, attach.
  **service_role only.**
- `random_quote()` — one random `(text, author_name)` pair, used by the
  daily notification. Public execute.
- `ensure_quote_of_the_day(date)` — assigns tomorrow's quote_of_the_day
  pairing if one isn't already assigned: picks a quote not yet used for
  any date (falls back to any quote once the pool is exhausted) and
  inserts it, idempotently. `security definer`, since `quote_of_the_day`
  has no client insert policy — but **not client-callable at all**
  (`revoke ... from public`, no grant to `anon`/`authenticated`); only
  `pg_cron` calls it, a few hours ahead of each date (see
  `supabase/cron.sql`), so a pairing always already exists by the time any
  client reads it. Clients read `quote_of_the_day` as a plain table select
  (joined to `quotes`) — see `fetchQuoteOfDayRange()` in
  `src/lib/api/quotes.ts`, which only asks for dates missing from the
  local SQLite cache (today always, since its like/download counts still
  change; past days almost never).
- `record_download(quote_id, device_id?)` — bumps the quote's global
  `downloads_count` and the caller's own counter in `profiles`; credits
  `auth.uid()` if signed in, else the given `device_id`. Public execute
  (`security definer`).
- `merge_device_into_account(device_id)` — one-shot: moves a device's likes
  onto the calling account (skipping quotes already liked, to respect the
  unique index) and folds its download count in, then deletes the
  device-scoped rows. Called automatically right after first sign-in — see
  `mergeDeviceOnce()` in `session.svelte.ts`. **authenticated only.**

## Auth — dual identity, login optional

Likes/downloads work two ways, and a signed-in user's data is real-account
data, not device data:

- **Anonymous (default):** a plain client-generated `device_id` string —
  native uses `Device.getId()` (stable across reinstalls), web generates a
  `crypto.randomUUID()` cached in `localStorage` (`qq.deviceId`, lost if
  site data is cleared). No login of any kind, not even Supabase's
  anonymous auth (that was tried and removed — it silently 422s until
  enabled per-project in the dashboard, exactly the footgun this avoids).
- **Signed in (optional upgrade):** real Supabase auth via magic link
  (`signInWithOtp`), Google, or Apple. Google/Apple use
  `@capgo/capacitor-social-login` to get a native ID token, exchanged via
  `supabase.auth.signInWithIdToken({ provider, token })` — **not** a
  browser-redirect/custom-URL-scheme OAuth flow, so there's no Android
  intent-filter or `@capacitor/browser` involved. Works the same way on
  web via Google Identity Services (script tag in `src/app.html`).
- All of this lives in `src/lib/stores/session.svelte.ts`: `auth.deviceId`
  (always set), `auth.userId`/`auth.user` (set only when signed in),
  `signInWithEmailOtp`/`signInWithGoogle`/`signInWithApple`/`signOut`. UI is
  in the Account section of `/settings`.
- `src/lib/api/quotes.ts` picks whichever identity is active
  (`auth.userId` if present, else `auth.deviceId`) for every like/download
  read and write — see `toQuote()`'s `liked_by_me` check and `setLiked()`.

RLS reflects the trust difference: device_id writes on `likes`/`profiles`
are open to `anon, authenticated` with no ownership check (self-reported,
spoofable by design — that was an explicit call, don't try to retrofit
verification onto them). user_id writes require `auth.uid() = user_id`,
same as any normal Supabase RLS pattern. Both `likes` and `profiles` carry
a check constraint requiring exactly one of `device_id`/`user_id` to be
set, and partial unique indexes enforce one like per quote per identity.

Google/Apple need dashboard + Cloud console setup (Google Cloud OAuth
client IDs, Apple Sign-In service ID/key, both registered under Supabase
Dashboard → Authentication → Providers) — not yet done as of this
writing. `PUBLIC_GOOGLE_WEB_CLIENT_ID` / `PUBLIC_GOOGLE_IOS_CLIENT_ID` in
`.env` are empty placeholders until then; Google/Apple sign-in will not
work until they're filled in and the corresponding providers are enabled.

## Environment / keys

Live project: **QQ Quotes**, ref `ayrgvvslpogfqjfsuzqe`, org
`dtpjehzzcmbamckdqpys`, region `us-east-2`.

`.env` (gitignored, see `.env.example` for the shape):

```
PUBLIC_SUPABASE_URL=https://ayrgvvslpogfqjfsuzqe.supabase.co
PUBLIC_SUPABASE_ANON_KEY=<publishable key, sb_publishable_...>
PUBLIC_GOOGLE_WEB_CLIENT_ID=<Google Cloud OAuth web client id>
PUBLIC_GOOGLE_IOS_CLIENT_ID=<Google Cloud OAuth iOS client id>
```

The two Google client IDs are only needed for Google sign-in (see Auth
above) — everything else works with them left blank.

The Edge Function uses `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`
(injected automatically by the Supabase runtime — not something you set by
hand). The `service_role` key only appears in `supabase/cron.sql` when it's
filled in locally to schedule the pg_cron job against the deployed
function; that file is checked in with placeholders
(`YOUR-PROJECT-REF`, `YOUR-SERVICE-ROLE-KEY`) — **never commit the filled-in
version**. If you need to re-run it, fetch keys with
`supabase projects api-keys --project-ref ayrgvvslpogfqjfsuzqe` (legacy
`service_role` JWT works fine for this; substitute and pipe to
`supabase db query --linked --file <tmpfile>`, then delete the tmpfile).

Supabase CLI is a project devDependency (`npx supabase ...`), not global —
Supabase's npm package deliberately refuses a global install, so `-g` will
error on purpose telling you to use a local dep or a binary release
instead. It's already linked to the project (`supabase link --project-ref
ayrgvvslpogfqjfsuzqe`); `supabase login` needs a real TTY/browser and can't
run inside a non-interactive session — that has to be done in a real
terminal.

## Setup from scratch

```sh
npm install
cp .env.example .env   # fill in PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY
npx supabase login     # interactive, needs a real terminal
npx supabase link --project-ref ayrgvvslpogfqjfsuzqe
npx supabase db query --linked --file supabase/schema.sql
npx supabase db query --linked --file supabase/seed.sql
npx supabase functions deploy ingest-zenquotes --no-verify-jwt
# fill in supabase/cron.sql (project ref + service role key), then:
npx supabase db query --linked --file <filled-in-cron.sql>
```

Likes/downloads work immediately via the client-generated `device_id` — no
auth setup needed for that. Magic-link sign-in also works out of the box
(Supabase email auth is on by default). Google/Apple sign-in additionally
need the dashboard/Cloud console setup described in Auth above.

## Commands

```sh
npm run dev              # vite dev server
npm run check             # svelte-kit sync + svelte-check
npm run build              # static build → build/
npx cap sync android        # copy build/ into the Android project
npx cap run android          # build + run on device/emulator
npx playwright install chromium   # browser binary only; --with-deps tries
                                    # apt-get and fails on Manjaro — the
                                    # actual runtime libs (nss, gtk3,
                                    # mesa, cups, etc.) are already present
                                    # via pacman on this machine
```

## Known open items (as of last session)

- No visual/manual test of the Android build yet — only web (Playwright)
  and direct Supabase query checks have been run.
- Tags are effectively unused outside the seed data — ZenQuotes-ingested
  quotes have no tags. If subject tagging needs to actually scale, that's
  a separate design conversation (LLM-based tagging pass? manual curation
  UI?) — don't assume the current `add_quote_tags` RPC is sufficient
  infrastructure for that on its own, it's just plumbing.
- `package-lock.json` / `node_modules` include the Supabase CLI and
  Playwright as devDependencies now — normal, not accidental bloat.

## Working style notes for this project

- Backend content mutations (schema, RPCs, ingestion) should default to
  **service_role-only**; don't add authenticated-user write policies for
  quotes/authors/tags without an explicit ask (see Content model above).
- When verifying against the live Supabase project, prefer
  `supabase db query --linked "<sql>"` over guessing — it's fast and
  authoritative. Positional arg for the query, `--file` for a script; there
  is no `db execute` subcommand.
- Playwright screenshots are a good way to actually verify UI changes in
  this sandbox (no display, but headless Chromium works fine once the
  binary is installed — see Commands above).
