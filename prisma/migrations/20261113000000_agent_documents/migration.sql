CREATE TYPE "DocStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "AgentDocument" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "expiresOn" DATE,
    "status" "DocStatus" NOT NULL DEFAULT 'PENDING',
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentDocument_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AgentDocument_userId_kind_createdAt_idx" ON "AgentDocument"("userId", "kind", "createdAt");
CREATE INDEX "AgentDocument_status_idx" ON "AgentDocument"("status");
ALTER TABLE "AgentDocument" ADD CONSTRAINT "AgentDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentDocument" ADD CONSTRAINT "AgentDocument_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
