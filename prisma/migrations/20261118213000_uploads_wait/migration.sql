-- Files attached in the assistant's chat wait here until they are saved to a contact's Documents.
CREATE TABLE "AssistantUpload" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "chatId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "data" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssistantUpload_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AssistantUpload_chatId_createdAt_idx" ON "AssistantUpload"("chatId", "createdAt");
ALTER TABLE "AssistantUpload" ADD CONSTRAINT "AssistantUpload_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "AssistantChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Files handed to Zapier since Nov 17 never reached EZLynx (its search by zip found nobody), so they are marked to go again.
UPDATE "Document" SET "ezlynxSentAt" = NULL WHERE "ezlynxSentAt" >= '2026-11-17 23:20:00';
