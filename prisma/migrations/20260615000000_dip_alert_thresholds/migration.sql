-- Add global thresholds to portfolios
ALTER TABLE "portfolios"
  ADD COLUMN "global_dip_threshold"     DOUBLE PRECISION NOT NULL DEFAULT 0.10,
  ADD COLUMN "global_buy_now_threshold" DOUBLE PRECISION NOT NULL DEFAULT 0.20;

-- Add per-holding threshold overrides
ALTER TABLE "holdings"
  ADD COLUMN "dip_threshold"     DOUBLE PRECISION,
  ADD COLUMN "buy_now_threshold" DOUBLE PRECISION;

-- Add triggered flags to dip_alerts
ALTER TABLE "dip_alerts"
  ADD COLUMN "dip_triggered"     BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "buy_now_triggered" BOOLEAN NOT NULL DEFAULT false;
