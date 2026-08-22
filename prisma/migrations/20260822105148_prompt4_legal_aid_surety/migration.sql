-- AlterTable
ALTER TABLE "Prisoner" ADD COLUMN     "next_of_kin_name" TEXT,
ADD COLUMN     "next_of_kin_phone" TEXT;

-- CreateTable
CREATE TABLE "LegalAidAssignment" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "lawyer_id" TEXT NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" TEXT NOT NULL,

    CONSTRAINT "LegalAidAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuretyStatus" (
    "id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "bond_amount" DOUBLE PRECISION,
    "surety_required" BOOLEAN NOT NULL DEFAULT false,
    "surety_arranged" BOOLEAN NOT NULL DEFAULT false,
    "arranged_at" TIMESTAMP(3),
    "notes" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SuretyStatus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LegalAidAssignment_application_id_key" ON "LegalAidAssignment"("application_id");

-- CreateIndex
CREATE UNIQUE INDEX "SuretyStatus_application_id_key" ON "SuretyStatus"("application_id");

-- AddForeignKey
ALTER TABLE "LegalAidAssignment" ADD CONSTRAINT "LegalAidAssignment_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalAidAssignment" ADD CONSTRAINT "LegalAidAssignment_lawyer_id_fkey" FOREIGN KEY ("lawyer_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuretyStatus" ADD CONSTRAINT "SuretyStatus_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
