-- Details of documents that sit in EZLynx (sent by Zapier). The files themselves stay in EZLynx.
CREATE TABLE "EzlynxDoc" (
  "id" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "ref" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "folder" TEXT,
  "policyNumber" TEXT,
  "addedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EzlynxDoc_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EzlynxDoc_ref_key" ON "EzlynxDoc"("ref");
CREATE INDEX "EzlynxDoc_contactId_addedAt_idx" ON "EzlynxDoc"("contactId", "addedAt");
ALTER TABLE "EzlynxDoc" ADD CONSTRAINT "EzlynxDoc_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
