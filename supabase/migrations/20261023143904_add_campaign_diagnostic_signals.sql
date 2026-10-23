-- Rule-based performance diagnostics. Compare the last two complete 7-day
-- windows; signals are advisory and never change an ad account automatically.
CREATE OR REPLACE VIEW public.campaign_diagnostic_signals
WITH (security_invoker = true)
AS
WITH base AS (
  SELECT
    c.id AS campaign_id,
    c.user_id,
    c.name AS campaign_name,
    c.platform,
    c.status AS campaign_status,
    c.start_date,
    COALESCE(t.min_clicks_for_alert, 50) AS min_clicks_for_alert,
    COALESCE(t.min_conversions_for_decision, 5) AS min_conversions_for_decision,
    t.target_ctr_percent,
    t.target_cpc,
    t.target_cpa,
    t.target_roas,
    t.daily_spend_limit,
    MAX(m.metric_date) AS last_metric_date,

    COALESCE(SUM(m.spend) FILTER (
      WHERE m.metric_date >= CURRENT_DATE - 7 AND m.metric_date < CURRENT_DATE
    ), 0)::numeric AS current_spend,
    COALESCE(SUM(m.impressions) FILTER (
      WHERE m.metric_date >= CURRENT_DATE - 7 AND m.metric_date < CURRENT_DATE
    ), 0)::numeric AS current_impressions,
    COALESCE(SUM(m.clicks) FILTER (
      WHERE m.metric_date >= CURRENT_DATE - 7 AND m.metric_date < CURRENT_DATE
    ), 0)::numeric AS current_clicks,
    COALESCE(SUM(m.conversions) FILTER (
      WHERE m.metric_date >= CURRENT_DATE - 7 AND m.metric_date < CURRENT_DATE
    ), 0)::numeric AS current_conversions,
    COALESCE(SUM(m.revenue) FILTER (
      WHERE m.metric_date >= CURRENT_DATE - 7 AND m.metric_date < CURRENT_DATE
    ), 0)::numeric AS current_revenue,

    COALESCE(SUM(m.spend) FILTER (
      WHERE m.metric_date >= CURRENT_DATE - 14 AND m.metric_date < CURRENT_DATE - 7
    ), 0)::numeric AS previous_spend,
    COALESCE(SUM(m.impressions) FILTER (
      WHERE m.metric_date >= CURRENT_DATE - 14 AND m.metric_date < CURRENT_DATE - 7
    ), 0)::numeric AS previous_impressions,
    COALESCE(SUM(m.clicks) FILTER (
      WHERE m.metric_date >= CURRENT_DATE - 14 AND m.metric_date < CURRENT_DATE - 7
    ), 0)::numeric AS previous_clicks,
    COALESCE(SUM(m.conversions) FILTER (
      WHERE m.metric_date >= CURRENT_DATE - 14 AND m.metric_date < CURRENT_DATE - 7
    ), 0)::numeric AS previous_conversions,
    COALESCE(SUM(m.revenue) FILTER (
      WHERE m.metric_date >= CURRENT_DATE - 14 AND m.metric_date < CURRENT_DATE - 7
    ), 0)::numeric AS previous_revenue
  FROM public.campaigns c
  LEFT JOIN public.daily_metrics m ON m.campaign_id = c.id AND m.user_id = c.user_id
  LEFT JOIN public.campaign_targets t ON t.campaign_id = c.id AND t.user_id = c.user_id
  GROUP BY
    c.id, c.user_id, c.name, c.platform, c.status, c.start_date,
    t.min_clicks_for_alert, t.min_conversions_for_decision,
    t.target_ctr_percent, t.target_cpc, t.target_cpa, t.target_roas, t.daily_spend_limit
),
calculated AS (
  SELECT b.*,
    ROUND(current_clicks / NULLIF(current_impressions, 0) * 100, 3) AS current_ctr_percent,
    ROUND(previous_clicks / NULLIF(previous_impressions, 0) * 100, 3) AS previous_ctr_percent,
    ROUND(current_spend / NULLIF(current_clicks, 0), 2) AS current_cpc,
    ROUND(previous_spend / NULLIF(previous_clicks, 0), 2) AS previous_cpc,
    ROUND(current_spend / NULLIF(current_conversions, 0), 2) AS current_cpa,
    ROUND(previous_spend / NULLIF(previous_conversions, 0), 2) AS previous_cpa,
    ROUND(current_revenue / NULLIF(current_spend, 0), 3) AS current_roas,
    ROUND(previous_revenue / NULLIF(previous_spend, 0), 3) AS previous_roas
  FROM base b
),
signals AS (
  SELECT campaign_id, user_id, campaign_name, platform,
    'targets_not_configured'::text AS signal_type,
    'low'::text AS severity,
    NULL::numeric AS current_value,
    NULL::numeric AS previous_value,
    NULL::numeric AS change_percent,
    0::numeric AS sample_size,
    'Performance targets have not been set. Diagnostics will be more useful after CTR, CPC, CPA, ROAS or daily-spend targets are configured.'::text AS explanation,
    'Set realistic campaign targets and minimum sample thresholds before making optimization decisions.'::text AS recommended_action,
    jsonb_build_object('target_ctr_percent', target_ctr_percent, 'target_cpc', target_cpc, 'target_cpa', target_cpa, 'target_roas', target_roas, 'daily_spend_limit', daily_spend_limit) AS evidence,
    CURRENT_DATE - 7 AS window_start, CURRENT_DATE - 1 AS window_end
  FROM calculated
  WHERE campaign_status = 'active'
    AND target_ctr_percent IS NULL AND target_cpc IS NULL
    AND target_cpa IS NULL AND target_roas IS NULL AND daily_spend_limit IS NULL

  UNION ALL

  SELECT campaign_id, user_id, campaign_name, platform,
    'no_recent_metrics'::text, 'medium'::text,
    NULL::numeric, NULL::numeric, NULL::numeric, 0::numeric,
    'No daily-metric record has been received recently for this active campaign.',
    'Check whether data import or tracking is working and confirm the campaign is still running.',
    jsonb_build_object('last_metric_date', last_metric_date, 'campaign_start_date', start_date),
    CURRENT_DATE - 7, CURRENT_DATE - 1
  FROM calculated
  WHERE campaign_status = 'active'
    AND start_date IS NOT NULL
    AND start_date <= CURRENT_DATE - 3
    AND (last_metric_date IS NULL OR last_metric_date <= CURRENT_DATE - 3)

  UNION ALL

  SELECT campaign_id, user_id, campaign_name, platform,
    'ctr_drop'::text,
    CASE WHEN current_ctr_percent <= previous_ctr_percent * 0.6 THEN 'high' ELSE 'medium' END,
    current_ctr_percent, previous_ctr_percent,
    ROUND((current_ctr_percent / NULLIF(previous_ctr_percent, 0) - 1) * 100, 2),
    current_impressions,
    'CTR has dropped by at least 20% compared with the previous complete 7-day window.',
    'Review creative fatigue, audience relevance, placement mix and impression quality. Validate with a controlled test before making large changes.',
    jsonb_build_object('current_impressions', current_impressions, 'previous_impressions', previous_impressions, 'current_clicks', current_clicks, 'previous_clicks', previous_clicks),
    CURRENT_DATE - 7, CURRENT_DATE - 1
  FROM calculated
  WHERE previous_impressions >= 1000
    AND current_impressions >= 1000
    AND previous_ctr_percent > 0
    AND current_ctr_percent <= previous_ctr_percent * 0.8

  UNION ALL

  SELECT campaign_id, user_id, campaign_name, platform,
    'cpc_increase'::text,
    CASE WHEN current_cpc >= previous_cpc * 1.5 THEN 'high' ELSE 'medium' END,
    current_cpc, previous_cpc,
    ROUND((current_cpc / NULLIF(previous_cpc, 0) - 1) * 100, 2),
    current_clicks,
    'CPC has increased by at least 20% versus the previous complete 7-day window.',
    'Compare audience, placement, creative relevance and auction conditions. Check that campaign objectives and attribution settings match.',
    jsonb_build_object('current_spend', current_spend, 'previous_spend', previous_spend, 'current_clicks', current_clicks, 'previous_clicks', previous_clicks),
    CURRENT_DATE - 7, CURRENT_DATE - 1
  FROM calculated
  WHERE previous_clicks >= min_clicks_for_alert
    AND current_clicks >= min_clicks_for_alert
    AND previous_cpc > 0
    AND current_cpc >= previous_cpc * 1.2

  UNION ALL

  SELECT campaign_id, user_id, campaign_name, platform,
    'cpa_increase'::text,
    CASE WHEN current_conversions = 0 OR current_cpa >= previous_cpa * 1.5 THEN 'high' ELSE 'medium' END,
    current_cpa, previous_cpa,
    CASE WHEN current_conversions = 0 THEN 100::numeric
         ELSE ROUND((current_cpa / NULLIF(previous_cpa, 0) - 1) * 100, 2) END,
    current_conversions,
    CASE WHEN current_conversions = 0
         THEN 'The current 7-day window has spend but no recorded conversions, after the prior window met the minimum-conversion threshold.'
         ELSE 'CPA has increased by at least 25% compared with the previous complete 7-day window.' END,
    'Verify conversion tracking, conversion lag, traffic quality and landing-page performance before changing budget or bids.',
    jsonb_build_object('current_spend', current_spend, 'previous_spend', previous_spend, 'current_conversions', current_conversions, 'previous_conversions', previous_conversions, 'minimum_conversions', min_conversions_for_decision),
    CURRENT_DATE - 7, CURRENT_DATE - 1
  FROM calculated
  WHERE previous_conversions >= min_conversions_for_decision
    AND previous_conversions > 0
    AND previous_cpa > 0
    AND current_spend > 0
    AND (current_conversions = 0 OR
         (current_conversions >= min_conversions_for_decision AND current_cpa >= previous_cpa * 1.25))

  UNION ALL

  SELECT campaign_id, user_id, campaign_name, platform,
    'roas_drop'::text,
    CASE WHEN current_roas <= previous_roas * 0.6 OR current_revenue = 0 THEN 'high' ELSE 'medium' END,
    current_roas, previous_roas,
    ROUND((current_roas / NULLIF(previous_roas, 0) - 1) * 100, 2),
    current_spend,
    'ROAS has dropped by at least 20% compared with the previous complete 7-day window.',
    'Verify revenue attribution and conversion lag, then compare spend, conversion volume and average order value before adjusting campaigns.',
    jsonb_build_object('current_spend', current_spend, 'previous_spend', previous_spend, 'current_revenue', current_revenue, 'previous_revenue', previous_revenue),
    CURRENT_DATE - 7, CURRENT_DATE - 1
  FROM calculated
  WHERE previous_spend > 0
    AND previous_roas > 0
    AND current_spend > 0
    AND (current_revenue = 0 OR current_roas <= previous_roas * 0.8)

  UNION ALL

  SELECT campaign_id, user_id, campaign_name, platform,
    'spend_rising_without_conversion_lift'::text,
    CASE WHEN current_spend >= previous_spend * 1.5 THEN 'high' ELSE 'medium' END,
    current_spend, previous_spend,
    ROUND((current_spend / NULLIF(previous_spend, 0) - 1) * 100, 2),
    current_conversions,
    'Spend is up at least 30%, while conversions have not increased by more than 5% versus the prior window.',
    'Review spend distribution and conversion volume. Do not automatically cut or increase budget; confirm sample size and business context first.',
    jsonb_build_object('current_conversions', current_conversions, 'previous_conversions', previous_conversions, 'current_spend', current_spend, 'previous_spend', previous_spend),
    CURRENT_DATE - 7, CURRENT_DATE - 1
  FROM calculated
  WHERE previous_spend > 0
    AND current_spend >= previous_spend * 1.3
    AND current_conversions <= previous_conversions * 1.05

  UNION ALL

  SELECT campaign_id, user_id, campaign_name, platform,
    'daily_spend_limit_exceeded'::text,
    CASE WHEN current_spend / 7 >= daily_spend_limit * 1.5 THEN 'high' ELSE 'medium' END,
    ROUND(current_spend / 7, 2), daily_spend_limit,
    ROUND((current_spend / 7 / NULLIF(daily_spend_limit, 0) - 1) * 100, 2),
    current_spend,
    'Average daily spend over the most recent complete 7-day window exceeds the configured daily spend limit by at least 15%.',
    'Confirm the limit is current and review budget pacing. This signal does not change the ad-platform budget.',
    jsonb_build_object('current_7_day_spend', current_spend, 'configured_daily_limit', daily_spend_limit),
    CURRENT_DATE - 7, CURRENT_DATE - 1
  FROM calculated
  WHERE daily_spend_limit > 0
    AND current_spend / 7 >= daily_spend_limit * 1.15
)
SELECT campaign_id, user_id, campaign_name, platform, signal_type, severity,
  current_value, previous_value, change_percent, sample_size,
  explanation, recommended_action, evidence, window_start, window_end
FROM signals;

COMMENT ON VIEW public.campaign_diagnostic_signals IS
'Rule-based campaign diagnostics comparing the last two complete 7-day windows. Signals are advisory, not causal claims or automatic ad-account actions.';

REVOKE ALL PRIVILEGES ON TABLE public.campaign_diagnostic_signals FROM authenticated, anon, PUBLIC;
GRANT SELECT ON TABLE public.campaign_diagnostic_signals TO authenticated;
