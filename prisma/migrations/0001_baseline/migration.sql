-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "public"."cash_accounts" (
    "id" TEXT NOT NULL,
    "portfolio_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "balance" BIGINT NOT NULL DEFAULT 0,
    "target_allocation_pct" DECIMAL(5,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."dividend_cache" (
    "id" TEXT NOT NULL,
    "ticker_symbol" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "declare_date" DATE,
    "ex_date" DATE NOT NULL,
    "pay_date" DATE,
    "amount_per_share" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "frequency" TEXT,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dividend_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."explore_profiles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "allocations" JSONB NOT NULL,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "explore_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."folders" (
    "id" TEXT NOT NULL,
    "portfolio_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "target_allocation_pct" DECIMAL(5,2),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_hidden_when_shared" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."fx_rates" (
    "id" TEXT NOT NULL,
    "from_currency" TEXT NOT NULL,
    "to_currency" TEXT NOT NULL,
    "rate" DECIMAL(12,6) NOT NULL,
    "rate_date" DATE NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fx_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."holdings" (
    "id" TEXT NOT NULL,
    "folder_id" TEXT NOT NULL,
    "ticker_symbol" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "expense_ratio" DECIMAL(6,4),
    "target_allocation_pct" DECIMAL(5,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "holdings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."lots" (
    "id" TEXT NOT NULL,
    "holding_id" TEXT NOT NULL,
    "purchase_date" DATE NOT NULL,
    "shares" DECIMAL(18,6) NOT NULL,
    "cost_per_share" BIGINT NOT NULL,
    "cost_currency" TEXT NOT NULL DEFAULT 'ILS',
    "account_type" TEXT,
    "sold_shares" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "sold_date" DATE,
    "sold_price_per_share" BIGINT,
    "proceeds_from_sale" BIGINT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."portfolios" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "base_currency" TEXT NOT NULL DEFAULT 'ILS',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portfolios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."price_cache" (
    "id" TEXT NOT NULL,
    "ticker_symbol" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "price" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "price_date" DATE NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."transactions" (
    "id" TEXT NOT NULL,
    "portfolio_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "holding_id" TEXT,
    "lot_id" TEXT,
    "cash_account_id" TEXT,
    "shares" DECIMAL(18,6),
    "price_per_share" BIGINT,
    "amount" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "realized_gain" BIGINT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cash_accounts_portfolio_id_idx" ON "public"."cash_accounts"("portfolio_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "dividend_cache_ticker_symbol_ex_date_key" ON "public"."dividend_cache"("ticker_symbol" ASC, "ex_date" ASC);

-- CreateIndex
CREATE INDEX "dividend_cache_ticker_symbol_idx" ON "public"."dividend_cache"("ticker_symbol" ASC);

-- CreateIndex
CREATE INDEX "folders_parent_id_idx" ON "public"."folders"("parent_id" ASC);

-- CreateIndex
CREATE INDEX "folders_portfolio_id_idx" ON "public"."folders"("portfolio_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "fx_rates_from_currency_to_currency_rate_date_key" ON "public"."fx_rates"("from_currency" ASC, "to_currency" ASC, "rate_date" ASC);

-- CreateIndex
CREATE INDEX "holdings_folder_id_idx" ON "public"."holdings"("folder_id" ASC);

-- CreateIndex
CREATE INDEX "holdings_ticker_symbol_idx" ON "public"."holdings"("ticker_symbol" ASC);

-- CreateIndex
CREATE INDEX "lots_holding_id_idx" ON "public"."lots"("holding_id" ASC);

-- CreateIndex
CREATE INDEX "portfolios_user_id_idx" ON "public"."portfolios"("user_id" ASC);

-- CreateIndex
CREATE INDEX "price_cache_ticker_symbol_price_date_idx" ON "public"."price_cache"("ticker_symbol" ASC, "price_date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "price_cache_ticker_symbol_price_date_key" ON "public"."price_cache"("ticker_symbol" ASC, "price_date" ASC);

-- CreateIndex
CREATE INDEX "transactions_date_idx" ON "public"."transactions"("date" DESC);

-- CreateIndex
CREATE INDEX "transactions_holding_id_idx" ON "public"."transactions"("holding_id" ASC);

-- CreateIndex
CREATE INDEX "transactions_portfolio_id_idx" ON "public"."transactions"("portfolio_id" ASC);

-- AddForeignKey
ALTER TABLE "public"."cash_accounts" ADD CONSTRAINT "cash_accounts_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."folders" ADD CONSTRAINT "folders_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."folders" ADD CONSTRAINT "folders_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."holdings" ADD CONSTRAINT "holdings_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."lots" ADD CONSTRAINT "lots_holding_id_fkey" FOREIGN KEY ("holding_id") REFERENCES "public"."holdings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."transactions" ADD CONSTRAINT "transactions_cash_account_id_fkey" FOREIGN KEY ("cash_account_id") REFERENCES "public"."cash_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."transactions" ADD CONSTRAINT "transactions_holding_id_fkey" FOREIGN KEY ("holding_id") REFERENCES "public"."holdings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."transactions" ADD CONSTRAINT "transactions_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."transactions" ADD CONSTRAINT "transactions_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
