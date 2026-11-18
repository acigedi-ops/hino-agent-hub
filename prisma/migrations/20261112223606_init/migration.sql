-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'AGENT');

-- CreateEnum
CREATE TYPE "Stage" AS ENUM ('LEAD', 'PROSPECT', 'QUOTING', 'QUOTED', 'CLIENT', 'LOST', 'FORMER');

-- CreateEnum
CREATE TYPE "QuoteType" AS ENUM ('PERSONAL', 'COMMERCIAL');

-- CreateEnum
CREATE TYPE "PolicyStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'AGENT',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "stage" "Stage" NOT NULL DEFAULT 'LEAD',
    "type" "QuoteType" NOT NULL DEFAULT 'PERSONAL',
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "phoneNorm" TEXT,
    "email" TEXT,
    "emailNorm" TEXT,
    "dob" DATE,
    "address" TEXT,
    "leadSource" TEXT,
    "priority" TEXT,
    "lostReason" TEXT,
    "requoteDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Intake" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Intake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Policy" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "line" TEXT NOT NULL,
    "carrier" TEXT NOT NULL,
    "policyNumber" TEXT NOT NULL,
    "premium" DECIMAL(12,2) NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "expirationDate" DATE NOT NULL,
    "status" "PolicyStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Contact_agentId_stage_idx" ON "Contact"("agentId", "stage");

-- CreateIndex
CREATE INDEX "Contact_phoneNorm_idx" ON "Contact"("phoneNorm");

-- CreateIndex
CREATE INDEX "Contact_emailNorm_idx" ON "Contact"("emailNorm");

-- CreateIndex
CREATE UNIQUE INDEX "Intake_contactId_key" ON "Intake"("contactId");

-- CreateIndex
CREATE INDEX "Policy_contactId_idx" ON "Policy"("contactId");

-- CreateIndex
CREATE INDEX "Policy_expirationDate_idx" ON "Policy"("expirationDate");

-- CreateIndex
CREATE INDEX "Activity_contactId_createdAt_idx" ON "Activity"("contactId", "createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Intake" ADD CONSTRAINT "Intake_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
