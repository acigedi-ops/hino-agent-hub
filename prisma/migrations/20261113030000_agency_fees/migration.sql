CREATE TYPE "FeeStatus" AS ENUM ('PENDING', 'PAID', 'REFUNDED', 'VOID');
CREATE TABLE "AgencyFee" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "createdById" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "agentShare" DECIMAL(10,2) NOT NULL,
    "status" "FeeStatus" NOT NULL DEFAULT 'PENDING',
    "payLink" TEXT,
    "externalId" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidOutAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgencyFee_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AgencyFee_externalId_key" ON "AgencyFee"("externalId");
CREATE INDEX "AgencyFee_agentId_createdAt_idx" ON "AgencyFee"("agentId", "createdAt");
CREATE INDEX "AgencyFee_contactId_idx" ON "AgencyFee"("contactId");
CREATE INDEX "AgencyFee_status_idx" ON "AgencyFee"("status");
ALTER TABLE "AgencyFee" ADD CONSTRAINT "AgencyFee_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgencyFee" ADD CONSTRAINT "AgencyFee_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AgencyFee" ADD CONSTRAINT "AgencyFee_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- The declarations page and insurance card kinds become the required boxes.
UPDATE "Document" SET "kind" = 'Signed dec page' WHERE "kind" = 'Declarations page';
UPDATE "Document" SET "kind" = 'ID cards' WHERE "kind" = 'Insurance card';
