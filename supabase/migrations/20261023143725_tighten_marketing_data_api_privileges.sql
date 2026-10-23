-- Keep the API least-privileged. TRUNCATE bypasses RLS and must not be
-- available to normal authenticated users.
REVOKE ALL PRIVILEGES ON TABLE
  public.campaigns,
  public.daily_metrics,
  public.campaign_targets,
  public.optimization_tasks,
  public.experiments,
  public.tracking_links,
  public.optimization_history
FROM authenticated, anon, PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.campaigns,
  public.daily_metrics,
  public.campaign_targets,
  public.optimization_tasks,
  public.experiments,
  public.tracking_links,
  public.optimization_history
TO authenticated;

REVOKE ALL PRIVILEGES ON TABLE public.campaign_summary FROM authenticated, anon, PUBLIC;
GRANT SELECT ON TABLE public.campaign_summary TO authenticated;

CREATE INDEX IF NOT EXISTS optimization_history_campaign_id_idx
  ON public.optimization_history (campaign_id);
CREATE INDEX IF NOT EXISTS optimization_history_task_id_idx
  ON public.optimization_history (task_id);
CREATE INDEX IF NOT EXISTS optimization_history_experiment_id_idx
  ON public.optimization_history (experiment_id);
CREATE INDEX IF NOT EXISTS tracking_links_campaign_id_idx
  ON public.tracking_links (campaign_id);

-- Prevent a metric from being reassigned to a campaign the signed-in user does not own.
DROP POLICY IF EXISTS "own metrics update" ON public.daily_metrics;
CREATE POLICY "own metrics update" ON public.daily_metrics
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND EXISTS (
      SELECT 1
      FROM public.campaigns c
      WHERE c.id = campaign_id AND c.user_id = (SELECT auth.uid())
    )
  );
