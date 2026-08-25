-- AlterTable
ALTER TABLE "CaseRecord" ADD COLUMN     "external_ref_id" TEXT,
ADD COLUMN     "source_system" TEXT;

-- AlterTable
ALTER TABLE "Prisoner" ADD COLUMN     "date_of_birth_enc" TEXT,
ADD COLUMN     "external_ref_id" TEXT,
ADD COLUMN     "full_name_enc" TEXT,
ADD COLUMN     "name_idx" TEXT,
ADD COLUMN     "next_of_kin_name_enc" TEXT,
ADD COLUMN     "next_of_kin_phone_enc" TEXT,
ADD COLUMN     "photo_url_enc" TEXT,
ADD COLUMN     "source_system" TEXT,
ALTER COLUMN "full_name" DROP NOT NULL,
ALTER COLUMN "date_of_birth" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mfa_secret_enc" TEXT;

-- CreateTable
CREATE TABLE "RefreshSession" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "jti" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "rotated_from" TEXT,

    CONSTRAINT "RefreshSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT,
    "actor_type" TEXT NOT NULL DEFAULT 'user',
    "actor_name" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "fields_touched" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionBatch" (
    "id" TEXT NOT NULL,
    "jail_id" TEXT NOT NULL,
    "source_system" TEXT NOT NULL,
    "initiated_by" TEXT NOT NULL,
    "file_name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "row_count" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "merged_count" INTEGER NOT NULL DEFAULT 0,
    "rejected_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngestionBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionRow" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "row_no" INTEGER NOT NULL,
    "raw_data" JSONB NOT NULL,
    "mapped_data" JSONB NOT NULL,
    "validation_status" TEXT NOT NULL,
    "validation_errors" JSONB,
    "conflict_type" TEXT,
    "conflict_with_id" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolved_action" TEXT,
    "resolved_by" TEXT,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "IngestionRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataRequest" (
    "id" TEXT NOT NULL,
    "prisoner_id" TEXT NOT NULL,
    "requested_by" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "acted_by" TEXT,
    "acted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RefreshSession_jti_key" ON "RefreshSession"("jti");

-- CreateIndex
CREATE INDEX "RefreshSession_user_id_idx" ON "RefreshSession"("user_id");

-- CreateIndex
CREATE INDEX "AuditLog_entity_type_entity_id_idx" ON "AuditLog"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "AuditLog_actor_id_idx" ON "AuditLog"("actor_id");

-- CreateIndex
CREATE INDEX "AuditLog_created_at_idx" ON "AuditLog"("created_at");

-- CreateIndex
CREATE INDEX "IngestionBatch_jail_id_idx" ON "IngestionBatch"("jail_id");

-- CreateIndex
CREATE INDEX "IngestionRow_batch_id_idx" ON "IngestionRow"("batch_id");

-- CreateIndex
CREATE INDEX "DataRequest_prisoner_id_idx" ON "DataRequest"("prisoner_id");

-- CreateIndex
CREATE INDEX "Prisoner_name_idx_idx" ON "Prisoner"("name_idx");

-- AddForeignKey
ALTER TABLE "RefreshSession" ADD CONSTRAINT "RefreshSession_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionBatch" ADD CONSTRAINT "IngestionBatch_jail_id_fkey" FOREIGN KEY ("jail_id") REFERENCES "Jail"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionRow" ADD CONSTRAINT "IngestionRow_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "IngestionBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataRequest" ADD CONSTRAINT "DataRequest_prisoner_id_fkey" FOREIGN KEY ("prisoner_id") REFERENCES "Prisoner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
