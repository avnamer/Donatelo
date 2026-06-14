-- AlterTable
ALTER TABLE "folders" ADD COLUMN "is_watchlist" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "holdings" ADD COLUMN "target_folder_id" TEXT;

-- AddForeignKey
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_target_folder_id_fkey" FOREIGN KEY ("target_folder_id") REFERENCES "folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
