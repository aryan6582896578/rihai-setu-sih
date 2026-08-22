-- CreateTable
CREATE TABLE "OccupancySnapshot" (
    "id" TEXT NOT NULL,
    "jail_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "occupancy" INTEGER NOT NULL,
    "undertrial_count" INTEGER NOT NULL,
    "convict_count" INTEGER NOT NULL,

    CONSTRAINT "OccupancySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OccupancySnapshot_date_idx" ON "OccupancySnapshot"("date");

-- CreateIndex
CREATE UNIQUE INDEX "OccupancySnapshot_jail_id_date_key" ON "OccupancySnapshot"("jail_id", "date");

-- AddForeignKey
ALTER TABLE "OccupancySnapshot" ADD CONSTRAINT "OccupancySnapshot_jail_id_fkey" FOREIGN KEY ("jail_id") REFERENCES "Jail"("id") ON DELETE CASCADE ON UPDATE CASCADE;
