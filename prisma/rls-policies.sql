-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security Policies — Investment Tracker
--
-- PURPOSE: Ensure every authenticated user can only access their own data.
-- All policies use auth.uid() from Supabase Auth (JWT subject).
--
-- TABLES WITH USER DATA:
--   portfolios, folders, holdings, lots, cash_accounts,
--   transactions, holding_theses, agent_insights
--
-- SHARED / PUBLIC TABLES (no RLS needed):
--   price_cache, dividend_cache, fx_rates, explore_profiles
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── portfolios ──────────────────────────────────────────────────────────────
ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_own_portfolios" ON portfolios;
CREATE POLICY "users_own_portfolios" ON portfolios
  FOR ALL
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

-- ─── folders ─────────────────────────────────────────────────────────────────
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_own_folders" ON folders;
CREATE POLICY "users_own_folders" ON folders
  FOR ALL
  USING (
    portfolio_id IN (
      SELECT id FROM portfolios WHERE user_id = auth.uid()::text
    )
  )
  WITH CHECK (
    portfolio_id IN (
      SELECT id FROM portfolios WHERE user_id = auth.uid()::text
    )
  );

-- ─── holdings ────────────────────────────────────────────────────────────────
ALTER TABLE holdings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_own_holdings" ON holdings;
CREATE POLICY "users_own_holdings" ON holdings
  FOR ALL
  USING (
    folder_id IN (
      SELECT f.id FROM folders f
      JOIN portfolios p ON p.id = f.portfolio_id
      WHERE p.user_id = auth.uid()::text
    )
  )
  WITH CHECK (
    folder_id IN (
      SELECT f.id FROM folders f
      JOIN portfolios p ON p.id = f.portfolio_id
      WHERE p.user_id = auth.uid()::text
    )
  );

-- ─── lots ────────────────────────────────────────────────────────────────────
ALTER TABLE lots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_own_lots" ON lots;
CREATE POLICY "users_own_lots" ON lots
  FOR ALL
  USING (
    holding_id IN (
      SELECT h.id FROM holdings h
      JOIN folders f ON f.id = h.folder_id
      JOIN portfolios p ON p.id = f.portfolio_id
      WHERE p.user_id = auth.uid()::text
    )
  )
  WITH CHECK (
    holding_id IN (
      SELECT h.id FROM holdings h
      JOIN folders f ON f.id = h.folder_id
      JOIN portfolios p ON p.id = f.portfolio_id
      WHERE p.user_id = auth.uid()::text
    )
  );

-- ─── cash_accounts ───────────────────────────────────────────────────────────
ALTER TABLE cash_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_own_cash_accounts" ON cash_accounts;
CREATE POLICY "users_own_cash_accounts" ON cash_accounts
  FOR ALL
  USING (
    portfolio_id IN (
      SELECT id FROM portfolios WHERE user_id = auth.uid()::text
    )
  )
  WITH CHECK (
    portfolio_id IN (
      SELECT id FROM portfolios WHERE user_id = auth.uid()::text
    )
  );

-- ─── transactions ────────────────────────────────────────────────────────────
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_own_transactions" ON transactions;
CREATE POLICY "users_own_transactions" ON transactions
  FOR ALL
  USING (
    portfolio_id IN (
      SELECT id FROM portfolios WHERE user_id = auth.uid()::text
    )
  )
  WITH CHECK (
    portfolio_id IN (
      SELECT id FROM portfolios WHERE user_id = auth.uid()::text
    )
  );

-- ─── holding_theses ──────────────────────────────────────────────────────────
ALTER TABLE holding_theses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_own_theses" ON holding_theses;
CREATE POLICY "users_own_theses" ON holding_theses
  FOR ALL
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

-- ─── agent_insights ──────────────────────────────────────────────────────────
ALTER TABLE agent_insights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_own_insights" ON agent_insights;
CREATE POLICY "users_own_insights" ON agent_insights
  FOR ALL
  USING (
    portfolio_id IN (
      SELECT id FROM portfolios WHERE user_id = auth.uid()::text
    )
  )
  WITH CHECK (
    portfolio_id IN (
      SELECT id FROM portfolios WHERE user_id = auth.uid()::text
    )
  );

-- ─── price_cache (shared — all authenticated users can read, only server writes) ──
ALTER TABLE price_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_read_price_cache" ON price_cache;
CREATE POLICY "authenticated_read_price_cache" ON price_cache
  FOR SELECT USING (auth.role() = 'authenticated');

-- ─── dividend_cache (same as price_cache) ────────────────────────────────────
ALTER TABLE dividend_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_read_dividend_cache" ON dividend_cache;
CREATE POLICY "authenticated_read_dividend_cache" ON dividend_cache
  FOR SELECT USING (auth.role() = 'authenticated');

-- ─── fx_rates (same as price_cache) ──────────────────────────────────────────
ALTER TABLE fx_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_read_fx_rates" ON fx_rates;
CREATE POLICY "authenticated_read_fx_rates" ON fx_rates
  FOR SELECT USING (auth.role() = 'authenticated');

-- ─── daily_closes (shared cache — same as price_cache) ───────────────────────
ALTER TABLE daily_closes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_read_daily_closes" ON daily_closes;
CREATE POLICY "authenticated_read_daily_closes" ON daily_closes
  FOR SELECT USING (auth.role() = 'authenticated');

-- ─── explore_profiles (public read) ──────────────────────────────────────────
ALTER TABLE explore_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_read_explore_profiles" ON explore_profiles;
CREATE POLICY "public_read_explore_profiles" ON explore_profiles
  FOR SELECT USING (true);

-- ─── csv_import_rules (user data) ────────────────────────────────────────────
ALTER TABLE csv_import_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_own_csv_import_rules" ON csv_import_rules;
CREATE POLICY "users_own_csv_import_rules" ON csv_import_rules
  FOR ALL
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

-- ─── dip_alerts (user data) ──────────────────────────────────────────────────
ALTER TABLE dip_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_own_dip_alerts" ON dip_alerts;
CREATE POLICY "users_own_dip_alerts" ON dip_alerts
  FOR ALL
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);
