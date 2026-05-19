-- Rename camelCase column to snake_case to match project convention
ALTER TABLE "holding_theses" RENAME COLUMN "riskFactors" TO "risk_factors";
