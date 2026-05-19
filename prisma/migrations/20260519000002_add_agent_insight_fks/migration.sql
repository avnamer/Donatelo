-- Add FK constraints to agent_insights table
ALTER TABLE "agent_insights"
  ADD CONSTRAINT "agent_insights_portfolio_id_fkey"
  FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE CASCADE;

ALTER TABLE "agent_insights"
  ADD CONSTRAINT "agent_insights_holding_id_fkey"
  FOREIGN KEY ("holding_id") REFERENCES "holdings"("id") ON DELETE SET NULL;
