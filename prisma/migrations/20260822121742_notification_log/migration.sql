-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "recipient_type" TEXT NOT NULL,
    "recipient_contact" TEXT,
    "recipient_user_id" TEXT,
    "channel" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "related_entity_type" TEXT NOT NULL,
    "related_entity_id" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotificationLog_recipient_user_id_idx" ON "NotificationLog"("recipient_user_id");

-- CreateIndex
CREATE INDEX "NotificationLog_related_entity_type_related_entity_id_idx" ON "NotificationLog"("related_entity_type", "related_entity_id");
