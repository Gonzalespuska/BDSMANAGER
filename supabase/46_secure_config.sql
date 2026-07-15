-- 46_secure_config.sql
-- User 2026-07-15: „daj tam iba miesto kde copy pastnem ten kod a dam ulozit"
--
-- Simple key-value store pre runtime konfiguráciu (Meta OAuth token,
-- Page IDs, budúce integračné secrets). Admin ich mení cez /admin/meta-setup
-- form; nemusí sa škriabať s wrangler pages secret put a redeploy.
--
-- Iba admin číta/píše (RLS + endpointy). Values sú v plain text v DB
-- (Supabase je access-controlled) — netreba k tomu Vault extension.

CREATE TABLE IF NOT EXISTS public.secure_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  description TEXT
);

CREATE INDEX IF NOT EXISTS idx_secure_config_updated
  ON public.secure_config (updated_at DESC);

-- RLS — iba admin.
ALTER TABLE public.secure_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "secure_config_admin_only" ON public.secure_config;
CREATE POLICY "secure_config_admin_only" ON public.secure_config
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
       WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
       WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );
