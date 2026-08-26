-- AlterTable
ALTER TABLE "Prisoner" ADD COLUMN     "aadhaar_ref_token" TEXT,
ADD COLUMN     "failed_pin_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "locked_until" TIMESTAMP(3),
ADD COLUMN     "pin_hash" TEXT,
ADD COLUMN     "pin_must_change" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pin_set_at" TIMESTAMP(3),
ADD COLUMN     "reset_otp_expires_at" TIMESTAMP(3),
ADD COLUMN     "reset_otp_hash" TEXT;
