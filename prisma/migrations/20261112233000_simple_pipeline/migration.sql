-- Simplify stages: LEAD, PROSPECT and QUOTING all become APPLICANT.
CREATE TYPE "Stage_new" AS ENUM ('APPLICANT', 'QUOTED', 'CLIENT', 'LOST', 'FORMER');
ALTER TABLE "Contact" ALTER COLUMN "stage" DROP DEFAULT;
ALTER TABLE "Contact" ALTER COLUMN "stage" TYPE "Stage_new" USING (
  CASE "stage"::text WHEN 'LEAD' THEN 'APPLICANT' WHEN 'PROSPECT' THEN 'APPLICANT' WHEN 'QUOTING' THEN 'APPLICANT' ELSE "stage"::text END
)::"Stage_new";
DROP TYPE "Stage";
ALTER TYPE "Stage_new" RENAME TO "Stage";
ALTER TABLE "Contact" ALTER COLUMN "stage" SET DEFAULT 'APPLICANT';

CREATE TABLE "ReportImport" (
    "id" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "rows" INTEGER NOT NULL,
    "converted" INTEGER NOT NULL,
    "created" INTEGER NOT NULL,
    "updated" INTEGER NOT NULL,
    "skipped" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReportImport_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "ReportImport" ADD CONSTRAINT "ReportImport_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
