# qq

A quotation-sharing app: like quotes, browse what's trending, read author profiles, and get a daily quote notification.

**Stack:** SvelteKit (static/SPA) + TailwindCSS + Capacitor, backed by Supabase (Postgres, auth, RLS).

## Setup

```sh
npm install
cp .env.example .env   # fill in your Supabase project URL + anon key
npm run dev
```

## Supabase

1. Create a project at supabase.com.
2. Run `supabase/schema.sql` in the SQL editor.
3. Run `supabase/seed.sql` to bootstrap a small set of quotes (the ZenQuotes
   cron below fills in the rest over time).
4. Deploy the ingestion function and schedule it:
   ```sh
   supabase functions deploy ingest-zenquotes --no-verify-jwt
   ```
   Then edit `supabase/cron.sql` with your project ref and service role key,
   and run it in the SQL editor to schedule hourly ingestion from
   [ZenQuotes](https://zenquotes.io) (their free API has no bulk export, so
   this polls `/api/quotes` repeatedly over time and dedupes on
   author+text).

## Mobile (Capacitor)

```sh
npm run build
npx cap sync android
npx cap run android
```
