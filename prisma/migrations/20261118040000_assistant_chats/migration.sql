-- CreateTable
CREATE TABLE "AssistantChat" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantChat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantTurn" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantTurn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssistantChat_userId_lastAt_idx" ON "AssistantChat"("userId", "lastAt");

-- CreateIndex
CREATE INDEX "AssistantTurn_chatId_createdAt_idx" ON "AssistantTurn"("chatId", "createdAt");

-- AddForeignKey
ALTER TABLE "AssistantChat" ADD CONSTRAINT "AssistantChat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantTurn" ADD CONSTRAINT "AssistantTurn_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "AssistantChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

