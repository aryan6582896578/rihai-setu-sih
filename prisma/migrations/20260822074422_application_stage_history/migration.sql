-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "stage_history" JSONB NOT NULL DEFAULT '{}';
