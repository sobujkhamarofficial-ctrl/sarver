-- Initial campaign tracker schema.
-- Historical baseline reconstructed from the live schema; later migrations harden grants and update policies.

CREATE TABLE public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('facebook','google','tiktok','youtube','instagram','linkedin','other')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','completed')),
  budget numeric NOT NULL DEFAULT 0,
  start_date date,
  end_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.daily_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  metric_date date NOT NULL,
  spend numeric NOT NULL DEFAULT 0,
  impressions bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0,
  conversions bigint NOT NULL DEFAULT 0,
  revenue numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daily_metrics_campaign_id_metric_date_key UNIQUE (campaign_id, metric_date)
);

CREATE INDEX campaigns_user_id_idx ON public.campaigns (user_id);
CREATE INDEX daily_metrics_user_id_idx ON public.daily_metrics (user_id);
CREATE INDEX daily_metrics_campaign_id_idx ON public.daily_metrics (campaign_id);

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own campaigns select" ON public.campaigns
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "own campaigns insert" ON public.campaigns
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "own campaigns update" ON public.campaigns
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "own campaigns delete" ON public.campaigns
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "own metrics select" ON public.daily_metrics
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "own metrics insert" ON public.daily_metrics
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_id AND c.user_id = (SELECT auth.uid())
    )
  );
CREATE POLICY "own metrics update" ON public.daily_metrics
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "own metrics delete" ON public.daily_metrics
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

CREATE VIEW public.campaign_summary
WITH (security_invoker = true)
AS
SELECT
  c.id AS campaign_id,
  c.user_id,
  c.name,
  c.platform,
  c.status,
  c.budget,
  COALESCE(SUM(m.spend), 0::numeric) AS total_spend,
  COALESCE(SUM(m.impressions), 0::numeric) AS total_impressions,
  COALESCE(SUM(m.clicks), 0::numeric) AS total_clicks,
  COALESCE(SUM(m.conversions), 0::numeric) AS total_conversions,
  COALESCE(SUM(m.revenue), 0::numeric) AS total_revenue,
  ROUND(COALESCE(SUM(m.clicks) / NULLIF(SUM(m.impressions), 0::numeric) * 100::numeric, 0::numeric), 2) AS ctr_percent,
  ROUND(COALESCE(SUM(m.spend) / NULLIF(SUM(m.clicks), 0::numeric), 0::numeric), 2) AS cpc,
  ROUND(COALESCE(SUM(m.spend) / NULLIF(SUM(m.conversions), 0::numeric), 0::numeric), 2) AS cpa,
  ROUND(COALESCE(SUM(m.revenue) / NULLIF(SUM(m.spend), 0::numeric), 0::numeric), 2) AS roas
FROM public.campaigns c
LEFT JOIN public.daily_metrics m ON m.campaign_id = c.id
GROUP BY c.id;
