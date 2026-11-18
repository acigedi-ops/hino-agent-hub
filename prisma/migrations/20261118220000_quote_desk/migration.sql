-- Quote Desk: commercial quote requests from agents, the owner's quote, and the notes between them.
CREATE TABLE "QuoteRequest" (
  "id" TEXT NOT NULL, "agentId" TEXT NOT NULL, "businessName" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'SENT', "data" JSONB NOT NULL,
  "carrier" TEXT, "premium" DECIMAL(12,2), "downPayment" DECIMAL(12,2), "expiresOn" DATE, "quotedAt" TIMESTAMP(3), "outcomeReason" TEXT, "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuoteRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "QuoteRequest_agentId_status_idx" ON "QuoteRequest"("agentId", "status");
CREATE INDEX "QuoteRequest_status_createdAt_idx" ON "QuoteRequest"("status", "createdAt");
ALTER TABLE "QuoteRequest" ADD CONSTRAINT "QuoteRequest_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "QuoteFile" (
  "id" TEXT NOT NULL, "requestId" TEXT NOT NULL, "uploadedById" TEXT NOT NULL, "isQuote" BOOLEAN NOT NULL DEFAULT false, "filename" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL, "size" INTEGER NOT NULL, "data" BYTEA NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuoteFile_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "QuoteFile_requestId_createdAt_idx" ON "QuoteFile"("requestId", "createdAt");
ALTER TABLE "QuoteFile" ADD CONSTRAINT "QuoteFile_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "QuoteRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "QuoteNote" (
  "id" TEXT NOT NULL, "requestId" TEXT NOT NULL, "userId" TEXT NOT NULL, "text" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QuoteNote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "QuoteNote_requestId_createdAt_idx" ON "QuoteNote"("requestId", "createdAt");
ALTER TABLE "QuoteNote" ADD CONSTRAINT "QuoteNote_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "QuoteRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuoteNote" ADD CONSTRAINT "QuoteNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
