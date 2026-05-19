-- CreateTable
CREATE TABLE "holding_theses" (
    "id" TEXT NOT NULL,
    "holding_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "raw_text" TEXT NOT NULL,
    "thesis" TEXT NOT NULL,
    "horizon" TEXT,
    "catalysts" JSONB NOT NULL DEFAULT '[]',
    "riskFactors" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "holding_theses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_insights" (
    "id" TEXT NOT NULL,
    "portfolio_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "holding_id" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_insights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "holding_theses_holding_id_key" ON "holding_theses"("holding_id");

-- CreateIndex
CREATE INDEX "holding_theses_user_id_idx" ON "holding_theses"("user_id");

-- CreateIndex
CREATE INDEX "agent_insights_portfolio_id_dismissed_idx" ON "agent_insights"("portfolio_id", "dismissed");

-- CreateIndex
CREATE INDEX "agent_insights_created_at_idx" ON "agent_insights"("created_at" DESC);

-- AddForeignKey
ALTER TABLE "holding_theses" ADD CONSTRAINT "holding_theses_holding_id_fkey" FOREIGN KEY ("holding_id") REFERENCES "holdings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
