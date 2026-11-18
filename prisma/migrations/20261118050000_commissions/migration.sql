-- CreateTable
CREATE TABLE "CommissionStatement" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "sheet" TEXT NOT NULL,
    "net" DECIMAL(12,2) NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionLine" (
    "id" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "company" TEXT NOT NULL,
    "client" TEXT NOT NULL,
    "policyNumber" TEXT NOT NULL,
    "effDate" TIMESTAMP(3),
    "transDate" TIMESTAMP(3),
    "date" TIMESTAMP(3),
    "line" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "premium" DECIMAL(12,2),
    "amount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "CommissionLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommissionStatement_agentId_month_key" ON "CommissionStatement"("agentId", "month");

-- CreateIndex
CREATE INDEX "CommissionLine_statementId_position_idx" ON "CommissionLine"("statementId", "position");

-- AddForeignKey
ALTER TABLE "CommissionStatement" ADD CONSTRAINT "CommissionStatement_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionStatement" ADD CONSTRAINT "CommissionStatement_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionLine" ADD CONSTRAINT "CommissionLine_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "CommissionStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
