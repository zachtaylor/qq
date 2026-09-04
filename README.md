<img src="resources/icon.png" alt="qq icon" width="96" height="96">

# qq

A quotation-sharing app: like quotes, browse trending, browse by subject
tag, read author profiles, get a daily local notification with a random
quote.

**Live:** [qq.taylz.dev](https://qq.taylz.dev)

Ships as a client-side SPA (web) and as native Android and iOS apps via
Capacitor, sharing one codebase.

This is a real, actively-developed personal project and also a public code
sample — see [For reviewers](#for-reviewers-hiring--code-sample-notes)
below if you're here to evaluate the code rather than run the app.

## Stack

- **SvelteKit**, static adapter, SSR disabled — the whole app is a
  client-side SPA. There is no server runtime in production; Capacitor
  just serves the static build on-device.
- **TailwindCSS 4** via `@tailwindcss/vite` — utility classes only, no
  component library.
- **Capacitor** — wraps the static build for Android and iOS (local
  notifications, device ID, native social login token exchange).
- **Supabase** — Postgres + auth + RLS + Edge Functions + pg_cron. Likes
  and trending need a shared backend across users; Postgres RLS enforces
  "everyone reads, nobody but the system writes content" declaratively.
- **SQLite (sql.js/wasm)** on-device cache — quote-of-the-day history and
  liked/downloaded content are cached locally so past data never needs a
  network round-trip.

## Content model

Users do **not** submit quotes, authors, or tags — all content comes from
a scheduled ingestion job that pulls from the [ZenQuotes](https://zenquotes.io)
free API and dedupes into Postgres. The only thing a user can write is
their own like. This was a deliberate correction after an earlier version
allowed user submissions — see `CLAUDE.md` for the longer story and the
full data model / RPC reference.

## Auth

Likes and downloads work anonymously out of the box via a client-generated
device ID (no login, not even Supabase's anonymous auth). Signing in
(magic link, Google, or Apple) upgrades that activity to a real account
and merges any existing device-scoped likes into it. Fully optional — the
app is usable with zero auth setup.

## Setup

```sh
pnpm install
cp .env.example .env   # fill in PUBLIC_SUPABASE_URL / PUBLIC_SUPABASE_ANON_KEY
npx supabase login     # interactive, needs a real terminal
npx supabase link --project-ref <your-project-ref>
npx supabase db query --linked --file supabase/schema.sql
npx supabase db query --linked --file supabase/seed.sql
npx supabase functions deploy ingest-zenquotes --no-verify-jwt
# fill in supabase/cron.sql (project ref + service role key), then:
npx supabase db query --linked --file <filled-in-cron.sql>
```

Likes/downloads and magic-link sign-in work immediately with no further
setup. Google/Apple sign-in additionally require provider setup in the
Supabase dashboard and Google Cloud / Apple developer consoles (see
`CLAUDE.md`).

## Commands

```sh
pnpm dev                          # vite dev server
pnpm check                        # svelte-kit sync + svelte-check
pnpm build                        # static build → build/
npx cap sync android               # copy build/ into the Android project
npx cap run android                 # build + run on device/emulator
npx cap sync ios                    # copy build/ into the iOS project
npx cap run ios                     # build + run on device/simulator
```

## Mobile (Capacitor)

```sh
pnpm build
# then
npx cap sync android
npx cap run android
# or
npx cap sync ios
npx cap run ios
```

---

## For reviewers (hiring / code-sample notes)

If you're reading this to evaluate engineering ability rather than to run
the app, a few things worth knowing about how it was built:

**What this project demonstrates:**

- **Backend design discipline, not just CRUD.** Content is system-managed
  by design: RLS policies grant writes to `service_role` only for
  `authors`/`quotes`/`tags`, with a narrow, explicit exception for user
  likes.
- **Working within a real external API's constraints.** ZenQuotes has no
  bulk export and a tight rate limit (~5 req/30s). The ingestion function
  (`supabase/functions/ingest-zenquotes`) paces itself accordingly and
  leans on a Postgres `unique(author_id, text)` constraint plus
  `upsert ... ignoreDuplicates` to dedupe across repeated hourly runs
  rather than trying to track ingestion state itself.
- **Correctness under a stated invariant.** The "quote of the day"
  pairing is assigned once via a `security definer` RPC and never
  recomputed, so past days never change. `pg_cron` assigns each day's
  pairing a few hours ahead of time so clients never race the assignment.
- **Dual-identity data model done through RLS, not app logic.** Anonymous
  device IDs and real Supabase accounts both write to the same `likes`/
  `profiles` tables under a check constraint (exactly one of
  `device_id`/`user_id`) and different RLS trust levels (open write for
  device IDs, `auth.uid() = user_id` for accounts) — with a one-shot
  merge RPC to fold device history into an account on first sign-in.
- **Offline-first mobile concerns**: On-device SQLite caching, an offline
  banner, and native local notifications (not push) so the daily quote
  works without any server-push infrastructure.
- **Professional look and feel**: Swipe left or right to change tabs, pull to
- refresh, and smooth transition animations between pages. About half of all
  development time was spent fine tuning performance and appearance.

**Where to look:**

- `CLAUDE.md` — the fullest account of the system: data model, RPCs,
  auth model, environment, and the design decisions behind them.
- `supabase/schema.sql` — RLS policies and RPCs.
- `supabase/functions/ingest-zenquotes/` — external API integration with
  rate-limit pacing.
- `src/lib/stores/session.svelte.ts` — dual anonymous/account identity
  handling.
- `src/lib/localdb.ts` — on-device SQLite cache for offline/historical
  data.
