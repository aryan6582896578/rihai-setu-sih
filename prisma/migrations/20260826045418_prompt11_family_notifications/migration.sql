-- AlterTable
ALTER TABLE "NotificationLog" ADD COLUMN     "channel_used" TEXT,
ADD COLUMN     "dedupe_key" TEXT,
ADD COLUMN     "locale" TEXT,
ADD COLUMN     "template_key" TEXT;

-- AlterTable
ALTER TABLE "Prisoner" ADD COLUMN     "next_of_kin_consent_given" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "next_of_kin_preferred_channel" TEXT,
ADD COLUMN     "next_of_kin_preferred_locale" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "phone" TEXT;

-- CreateTable
CREATE TABLE "NotificationTemplate" (
    "id" TEXT NOT NULL,
    "event_key" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "message_template" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationTemplate_event_key_channel_locale_key" ON "NotificationTemplate"("event_key", "channel", "locale");

-- CreateIndex
CREATE INDEX "NotificationLog_dedupe_key_idx" ON "NotificationLog"("dedupe_key");
