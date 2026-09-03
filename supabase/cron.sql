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
    url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/ingest-zenquotes',
    headers := jsonb_build_object(
      'Authorization', 'Bearer YOUR-SERVICE-ROLE-KEY',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- To inspect scheduled runs: select * from cron.job_run_details order by start_time desc limit 20;
-- To unschedule: select cron.unschedule('ingest-zenquotes-hourly');
