-- Schedules the ZenQuotes ingestion Edge Function to run hourly.
-- Run once after deploying the function (`supabase functions deploy ingest-zenquotes --no-verify-jwt`).
-- Requires the pg_cron and pg_net extensions (enabled by default on Supabase projects).

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'ingest-zenquotes-hourly',
  '17 * * * *', -- once an hour, offset from the top to avoid other jobs
  $$
  select net.http_post(
    url := 'https://ayrgvvslpogfqjfsuzqe.supabase.co/functions/v1/ingest-zenquotes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- To inspect scheduled runs: select * from cron.job_run_details order by start_time desc limit 20;
-- To unschedule: select cron.unschedule('ingest-zenquotes-hourly');

-- Pre-assigns the next 14 days' quote-of-the-day pairings a few hours
-- ahead of UTC midnight, so a row always already exists by the time
-- anyone's "today" rolls over — ensure_quote_of_the_day() is never
-- invoked inline on a client request (it isn't even client-callable;
-- clients read quote_of_the_day directly, see src/lib/api/quotes.ts). No
-- net.http_post/service-role-key needed here, unlike the ingestion job
-- above — it's a plain SQL function call, so pg_cron can invoke it
-- directly. 14 days (not just +1) so the on-device notification rolling
-- window (see src/lib/notifications.ts) can schedule real, dated
-- quote-of-the-day notifications that far ahead; ensure_quote_of_the_day
-- is idempotent per date, so re-running this over already-assigned dates
-- every day is a no-op for them.
select cron.schedule(
  'assign-quote-of-the-day',
  '0 20 * * *', -- once a day, 20:00 UTC (4 hours ahead of the next date)
  $$ select ensure_quote_of_the_day(current_date + i) from generate_series(1, 14) as i; $$
);

-- To unschedule: select cron.unschedule('assign-quote-of-the-day');
