CREATE TYPE "FeeStatus" AS ENUM ('PENDING', 'PAID', 'REFUNDED', 'VOID');
CREATE TABLE "AgencyFee" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "agentShare" DECIMAL(10,2) NOT NULL,
    "method" TEXT NOT NULL,
    "collectedOn" DATE NOT NULL,
    "note" TEXT,
    "status" "FeeStatus" NOT NULL DEFAULT 'PENDING',
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "paidOutAt" TIMESTAMP(3),
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgencyFee_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AgencyFee_externalId_key" ON "AgencyFee"("externalId");
CREATE INDEX "AgencyFee_agentId_collectedOn_idx" ON "AgencyFee"("agentId", "collectedOn");
CREATE INDEX "AgencyFee_contactId_idx" ON "AgencyFee"("contactId");
CREATE INDEX "AgencyFee_status_idx" ON "AgencyFee"("status");
ALTER TABLE "AgencyFee" ADD CONSTRAINT "AgencyFee_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgencyFee" ADD CONSTRAINT "AgencyFee_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AgencyFee" ADD CONSTRAINT "AgencyFee_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
