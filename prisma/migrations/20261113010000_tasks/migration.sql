ALTER TABLE "Policy" ADD COLUMN "writtenDate" DATE, ADD COLUMN "cancelledAt" TIMESTAMP(3);
UPDATE "Policy" SET "writtenDate" = "effectiveDate";
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'manual',
    "title" TEXT NOT NULL,
    "dueOn" DATE NOT NULL,
    "assigneeId" TEXT NOT NULL,
    "createdById" TEXT,
    "contactId" TEXT,
    "policyId" TEXT,
    "autoKey" TEXT,
    "doneAt" TIMESTAMP(3),
    "doneNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Task_autoKey_key" ON "Task"("autoKey");
CREATE INDEX "Task_assigneeId_doneAt_dueOn_idx" ON "Task"("assigneeId", "doneAt", "dueOn");
CREATE INDEX "Task_contactId_idx" ON "Task"("contactId");
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "Policy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
