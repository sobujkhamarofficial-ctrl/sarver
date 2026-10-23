-- AdPulse Performance Marketer workspace foundation.
-- Adds workflow tables without dropping or replacing campaign data.

CREATE TABLE public.campaign_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL UNIQUE REFERENCES public.campaigns(id) ON DELETE CASCADE,
  target_ctr_percent numeric(8,3) CHECK (target_ctr_percent IS NULL OR target_ctr_percent >= 0),
  target_cpc numeric(14,2) CHECK (target_cpc IS NULL OR target_cpc >= 0),
  target_cpa numeric(14,2) CHECK (target_cpa IS NULL OR target_cpa >= 0),
  target_roas numeric(10,3) CHECK (target_roas IS NULL OR target_roas >= 0),
  daily_spend_limit numeric(14,2) CHECK (daily_spend_limit IS NULL OR daily_spend_limit >= 0),
  min_clicks_for_alert integer NOT NULL DEFAULT 50 CHECK (min_clicks_for_alert > 0),
  min_conversions_for_decision integer NOT NULL DEFAULT 5 CHECK (min_conversions_for_decision >= 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.optimization_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 180),
  issue_type text NOT NULL DEFAULT 'manual'
    CHECK (issue_type IN ('spend_spike','ctr_drop','cpc_increase','cpa_increase','roas_drop','budget_pacing','tracking_issue','creative_fatigue','conversion_drop','manual','other')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','done','dismissed')),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object'),
  recommended_action text,
  due_date date,
  resolved_at timestamptz,
  outcome_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 3 AND 180),
  hypothesis text NOT NULL CHECK (char_length(btrim(hypothesis)) BETWEEN 3 AND 2000),
  experiment_type text NOT NULL DEFAULT 'creative'
    CHECK (experiment_type IN ('creative','audience','offer','landing_page','bidding','budget','placement','other')),
  control_label text,
  variant_label text,
  primary_metric text NOT NULL DEFAULT 'cpa'
    CHECK (primary_metric IN ('ctr','cpc','cpa','roas','conversion_rate','cpm','conversions','other')),
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','running','completed','cancelled')),
  start_date date,
  end_date date,
  baseline_value numeric(16,4),
  variant_value numeric(16,4),
  result_summary text,
  learning text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date)
);

CREATE TABLE public.tracking_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  destination_url text NOT NULL CHECK (destination_url ~* '^https?://'),
  utm_source text NOT NULL CHECK (char_length(btrim(utm_source)) BETWEEN 1 AND 200),
  utm_medium text NOT NULL CHECK (char_length(btrim(utm_medium)) BETWEEN 1 AND 200),
  utm_campaign text NOT NULL CHECK (char_length(btrim(utm_campaign)) BETWEEN 1 AND 200),
  utm_term text,
  utm_content text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.optimization_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.optimization_tasks(id) ON DELETE SET NULL,
  experiment_id uuid REFERENCES public.experiments(id) ON DELETE SET NULL,
  action_type text NOT NULL DEFAULT 'other'
    CHECK (action_type IN ('budget_change','bid_change','targeting_change','creative_change','tracking_fix','landing_page_change','experiment','other')),
  description text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 3 AND 2000),
  rationale text,
  before_metrics jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(before_metrics) = 'object'),
  after_metrics jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(after_metrics) = 'object'),
  outcome text NOT NULL DEFAULT 'pending' CHECK (outcome IN ('improved','declined','neutral','inconclusive','pending')),
  outcome_notes text,
  action_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);

CREATE INDEX campaign_targets_user_id_idx ON public.campaign_targets (user_id);
CREATE INDEX optimization_tasks_user_status_priority_idx ON public.optimization_tasks (user_id, status, priority, created_at DESC);
CREATE INDEX optimization_tasks_campaign_idx ON public.optimization_tasks (campaign_id, created_at DESC);
CREATE INDEX experiments_user_status_idx ON public.experiments (user_id, status, created_at DESC);
CREATE INDEX experiments_campaign_idx ON public.experiments (campaign_id, created_at DESC);
CREATE INDEX tracking_links_user_created_idx ON public.tracking_links (user_id, created_at DESC);
CREATE INDEX optimization_history_user_campaign_date_idx ON public.optimization_history (user_id, campaign_id, action_at DESC);

ALTER TABLE public.campaign_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.optimization_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.optimization_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner can read campaign targets" ON public.campaign_targets
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id AND EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND c.user_id = (SELECT auth.uid())));
CREATE POLICY "owner can insert campaign targets" ON public.campaign_targets
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id AND EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND c.user_id = (SELECT auth.uid())));
CREATE POLICY "owner can update campaign targets" ON public.campaign_targets
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id AND EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND c.user_id = (SELECT auth.uid())))
  WITH CHECK ((SELECT auth.uid()) = user_id AND EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND c.user_id = (SELECT auth.uid())));
CREATE POLICY "owner can delete campaign targets" ON public.campaign_targets
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id AND EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND c.user_id = (SELECT auth.uid())));

CREATE POLICY "owner can read optimization tasks" ON public.optimization_tasks
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id AND EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND c.user_id = (SELECT auth.uid())));
CREATE POLICY "owner can insert optimization tasks" ON public.optimization_tasks
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id AND EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND c.user_id = (SELECT auth.uid())));
CREATE POLICY "owner can update optimization tasks" ON public.optimization_tasks
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id AND EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND c.user_id = (SELECT auth.uid())))
  WITH CHECK ((SELECT auth.uid()) = user_id AND EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND c.user_id = (SELECT auth.uid())));
CREATE POLICY "owner can delete optimization tasks" ON public.optimization_tasks
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id AND EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND c.user_id = (SELECT auth.uid())));

CREATE POLICY "owner can read experiments" ON public.experiments
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id AND EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND c.user_id = (SELECT auth.uid())));
CREATE POLICY "owner can insert experiments" ON public.experiments
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id AND EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND c.user_id = (SELECT auth.uid())));
CREATE POLICY "owner can update experiments" ON public.experiments
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id AND EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND c.user_id = (SELECT auth.uid())))
  WITH CHECK ((SELECT auth.uid()) = user_id AND EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND c.user_id = (SELECT auth.uid())));
CREATE POLICY "owner can delete experiments" ON public.experiments
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id AND EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND c.user_id = (SELECT auth.uid())));

CREATE POLICY "owner can read tracking links" ON public.tracking_links
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id AND (campaign_id IS NULL OR EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND c.user_id = (SELECT auth.uid()))));
CREATE POLICY "owner can insert tracking links" ON public.tracking_links
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id AND (campaign_id IS NULL OR EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND c.user_id = (SELECT auth.uid()))));
CREATE POLICY "owner can update tracking links" ON public.tracking_links
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id AND (campaign_id IS NULL OR EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND c.user_id = (SELECT auth.uid()))))
  WITH CHECK ((SELECT auth.uid()) = user_id AND (campaign_id IS NULL OR EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND c.user_id = (SELECT auth.uid()))));
CREATE POLICY "owner can delete tracking links" ON public.tracking_links
  FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "owner can read optimization history" ON public.optimization_history
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id
    AND EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND c.user_id = (SELECT auth.uid()))
    AND (task_id IS NULL OR EXISTS (SELECT 1 FROM public.optimization_tasks t WHERE t.id = task_id AND t.user_id = (SELECT auth.uid()) AND t.campaign_id = optimization_history.campaign_id))
    AND (experiment_id IS NULL OR EXISTS (SELECT 1 FROM public.experiments e WHERE e.id = experiment_id AND e.user_id = (SELECT auth.uid()) AND e.campaign_id = optimization_history.campaign_id)));
CREATE POLICY "owner can insert optimization history" ON public.optimization_history
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id
    AND EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND c.user_id = (SELECT auth.uid()))
    AND (task_id IS NULL OR EXISTS (SELECT 1 FROM public.optimization_tasks t WHERE t.id = task_id AND t.user_id = (SELECT auth.uid()) AND t.campaign_id = optimization_history.campaign_id))
    AND (experiment_id IS NULL OR EXISTS (SELECT 1 FROM public.experiments e WHERE e.id = experiment_id AND e.user_id = (SELECT auth.uid()) AND e.campaign_id = optimization_history.campaign_id)));
CREATE POLICY "owner can update optimization history" ON public.optimization_history
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id AND EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND c.user_id = (SELECT auth.uid())))
  WITH CHECK ((SELECT auth.uid()) = user_id
    AND EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND c.user_id = (SELECT auth.uid()))
    AND (task_id IS NULL OR EXISTS (SELECT 1 FROM public.optimization_tasks t WHERE t.id = task_id AND t.user_id = (SELECT auth.uid()) AND t.campaign_id = optimization_history.campaign_id))
    AND (experiment_id IS NULL OR EXISTS (SELECT 1 FROM public.experiments e WHERE e.id = experiment_id AND e.user_id = (SELECT auth.uid()) AND e.campaign_id = optimization_history.campaign_id)));
CREATE POLICY "owner can delete optimization history" ON public.optimization_history
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = user_id AND EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_id AND c.user_id = (SELECT auth.uid())));

-- The next migration hardens existing update policies and all grants.
