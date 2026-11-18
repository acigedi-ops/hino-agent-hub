CREATE TABLE "ReferralSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReferralSource_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ReferralSource_name_idx" ON "ReferralSource"("name");
ALTER TABLE "Contact" ADD COLUMN "referralSourceId" TEXT;
CREATE INDEX "Contact_referralSourceId_idx" ON "Contact"("referralSourceId");
ALTER TABLE "ReferralSource" ADD CONSTRAINT "ReferralSource_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_referralSourceId_fkey" FOREIGN KEY ("referralSourceId") REFERENCES "ReferralSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
