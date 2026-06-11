-- CreateTable
CREATE TABLE "dip_alerts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "portfolio_id" TEXT NOT NULL,
    "holding_id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "current_price" DOUBLE PRECISION NOT NULL,
    "high_52w" DOUBLE PRECISION NOT NULL,
    "high_ath" DOUBLE PRECISION,
    "high_90d" DOUBLE PRECISION NOT NULL,
    "drop_from_52w" DOUBLE PRECISION NOT NULL,
    "drop_from_ath" DOUBLE PRECISION,
    "drop_from_90d" DOUBLE PRECISION NOT NULL,
    "price_history" JSONB NOT NULL,
    "ai_suggestion" TEXT,
    "computed_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dip_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dip_alerts_holding_id_portfolio_id_key" ON "dip_alerts"("holding_id", "portfolio_id");

-- CreateIndex
CREATE INDEX "dip_alerts_portfolio_id_computed_at_idx" ON "dip_alerts"("portfolio_id", "computed_at" DESC);

-- AddForeignKey
ALTER TABLE "dip_alerts" ADD CONSTRAINT "dip_alerts_holding_id_fkey" FOREIGN KEY ("holding_id") REFERENCES "holdings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dip_alerts" ADD CONSTRAINT "dip_alerts_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
