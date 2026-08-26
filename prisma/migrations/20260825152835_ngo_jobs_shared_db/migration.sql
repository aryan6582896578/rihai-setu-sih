-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'ngo_partner';

-- CreateTable
CREATE TABLE "JobPosting" (
    "id" TEXT NOT NULL,
    "ngo_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "required_skills" TEXT[],
    "preferred_skills" TEXT[],
    "required_certificates" TEXT[],
    "min_experience_months" INTEGER NOT NULL DEFAULT 0,
    "job_category" TEXT NOT NULL DEFAULT '',
    "district" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "openings" INTEGER,
    "wage_info" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobPosting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobApplication" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "prisoner_id" TEXT NOT NULL,
    "applied_by" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobPosting_ngo_id_idx" ON "JobPosting"("ngo_id");

-- CreateIndex
CREATE INDEX "JobPosting_status_idx" ON "JobPosting"("status");

-- CreateIndex
CREATE INDEX "JobApplication_prisoner_id_idx" ON "JobApplication"("prisoner_id");

-- CreateIndex
CREATE INDEX "JobApplication_job_id_idx" ON "JobApplication"("job_id");

-- CreateIndex
CREATE UNIQUE INDEX "JobApplication_job_id_prisoner_id_key" ON "JobApplication"("job_id", "prisoner_id");

-- AddForeignKey
ALTER TABLE "JobPosting" ADD CONSTRAINT "JobPosting_ngo_id_fkey" FOREIGN KEY ("ngo_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "JobPosting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_prisoner_id_fkey" FOREIGN KEY ("prisoner_id") REFERENCES "Prisoner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
