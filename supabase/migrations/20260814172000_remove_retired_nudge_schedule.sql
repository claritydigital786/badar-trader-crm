-- Muhammad retired agent nudges. Remove every known legacy schedule if an
-- earlier schema or migration created it. The Edge Function remains disabled
-- as a second safety layer, but no database job should call it.

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname IN (
  'nudge-agents-every-5-min',
  'nudge-agents-every-15-min-business-hours',
  'nudge-agents-6pm-pkt-close'
);
