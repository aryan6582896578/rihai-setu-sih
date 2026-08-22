-- CreateEnum
CREATE TYPE "Role" AS ENUM ('super_admin', 'jail_superintendent', 'jail_staff', 'dlsa_lawyer', 'viewer');

-- CreateEnum
CREATE TYPE "ApplicationType" AS ENUM ('bail', 'personal_bond');

-- CreateEnum
CREATE TYPE "ApplicationStage" AS ENUM ('flagged', 'drafted', 'filed', 'hearing_scheduled', 'order_passed', 'released');

-- CreateEnum
CREATE TYPE "EligibilityStatus" AS ENUM ('eligible', 'not_eligible', 'excluded');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('enrolled', 'in_progress', 'completed');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('undertrial', 'convict', 'acquitted', 'closed');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Jail" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "sanctioned_capacity" INTEGER NOT NULL,
    "address" TEXT,
    "contact_phone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Jail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JailAccess" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "jail_id" TEXT NOT NULL,
    "role_at_jail" "Role" NOT NULL,

    CONSTRAINT "JailAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prisoner" (
    "id" TEXT NOT NULL,
    "jail_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "prisoner_reg_no" TEXT NOT NULL,
    "date_of_birth" TIMESTAMP(3) NOT NULL,
    "gender" TEXT NOT NULL,
    "admission_date" TIMESTAMP(3) NOT NULL,
    "photo_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Prisoner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseRecord" (
    "id" TEXT NOT NULL,
    "prisoner_id" TEXT NOT NULL,
    "cnr_number" TEXT,
    "case_number" TEXT NOT NULL,
    "court_name" TEXT NOT NULL,
    "offence" TEXT NOT NULL,
    "max_sentence_years" INTEGER NOT NULL,
    "carries_death_or_life" BOOLEAN NOT NULL,
    "is_first_time_offender" BOOLEAN NOT NULL,
    "pending_case_count" INTEGER NOT NULL,
    "custody_start_date" TIMESTAMP(3) NOT NULL,
    "case_status" "CaseStatus" NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaseRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EligibilityAssessment" (
    "id" TEXT NOT NULL,
    "prisoner_id" TEXT NOT NULL,
    "status" "EligibilityStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EligibilityAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "prisoner_id" TEXT NOT NULL,
    "type" "ApplicationType" NOT NULL,
    "stage" "ApplicationStage" NOT NULL DEFAULT 'flagged',
    "generated_document_url" TEXT,
    "filed_date" TIMESTAMP(3),
    "hearing_date" TIMESTAMP(3),
    "order_outcome" TEXT,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingProgram" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,

    CONSTRAINT "TrainingProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enrollment" (
    "id" TEXT NOT NULL,
    "prisoner_id" TEXT NOT NULL,
    "program_id" TEXT NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'enrolled',
    "progress_pct" INTEGER NOT NULL DEFAULT 0,
    "certificate_url" TEXT,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StallAlert" (
    "id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "days_stalled" INTEGER NOT NULL,
    "escalated" BOOLEAN NOT NULL DEFAULT false,
    "escalated_at" TIMESTAMP(3),

    CONSTRAINT "StallAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "prisoner_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Jail_code_key" ON "Jail"("code");

-- CreateIndex
CREATE INDEX "JailAccess_jail_id_idx" ON "JailAccess"("jail_id");

-- CreateIndex
CREATE UNIQUE INDEX "JailAccess_user_id_jail_id_key" ON "JailAccess"("user_id", "jail_id");

-- CreateIndex
CREATE UNIQUE INDEX "Prisoner_prisoner_reg_no_key" ON "Prisoner"("prisoner_reg_no");

-- CreateIndex
CREATE INDEX "Prisoner_jail_id_idx" ON "Prisoner"("jail_id");

-- CreateIndex
CREATE UNIQUE INDEX "CaseRecord_cnr_number_key" ON "CaseRecord"("cnr_number");

-- CreateIndex
CREATE INDEX "CaseRecord_prisoner_id_idx" ON "CaseRecord"("prisoner_id");

-- CreateIndex
CREATE INDEX "CaseRecord_case_status_idx" ON "CaseRecord"("case_status");

-- CreateIndex
CREATE INDEX "EligibilityAssessment_prisoner_id_idx" ON "EligibilityAssessment"("prisoner_id");

-- CreateIndex
CREATE INDEX "Application_stage_updated_at_idx" ON "Application"("stage", "updated_at");

-- CreateIndex
CREATE INDEX "Application_prisoner_id_idx" ON "Application"("prisoner_id");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingProgram_name_key" ON "TrainingProgram"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_prisoner_id_program_id_key" ON "Enrollment"("prisoner_id", "program_id");

-- CreateIndex
CREATE INDEX "StallAlert_escalated_idx" ON "StallAlert"("escalated");

-- CreateIndex
CREATE UNIQUE INDEX "StallAlert_entity_type_entity_id_stage_key" ON "StallAlert"("entity_type", "entity_id", "stage");

-- CreateIndex
CREATE INDEX "Note_prisoner_id_idx" ON "Note"("prisoner_id");

-- AddForeignKey
ALTER TABLE "JailAccess" ADD CONSTRAINT "JailAccess_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JailAccess" ADD CONSTRAINT "JailAccess_jail_id_fkey" FOREIGN KEY ("jail_id") REFERENCES "Jail"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prisoner" ADD CONSTRAINT "Prisoner_jail_id_fkey" FOREIGN KEY ("jail_id") REFERENCES "Jail"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseRecord" ADD CONSTRAINT "CaseRecord_prisoner_id_fkey" FOREIGN KEY ("prisoner_id") REFERENCES "Prisoner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EligibilityAssessment" ADD CONSTRAINT "EligibilityAssessment_prisoner_id_fkey" FOREIGN KEY ("prisoner_id") REFERENCES "Prisoner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_prisoner_id_fkey" FOREIGN KEY ("prisoner_id") REFERENCES "Prisoner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_prisoner_id_fkey" FOREIGN KEY ("prisoner_id") REFERENCES "Prisoner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "TrainingProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StallAlert" ADD CONSTRAINT "StallAlert_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_prisoner_id_fkey" FOREIGN KEY ("prisoner_id") REFERENCES "Prisoner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
