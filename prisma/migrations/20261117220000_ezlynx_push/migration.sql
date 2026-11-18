ALTER TABLE "Contact" ADD COLUMN "street" TEXT, ADD COLUMN "street2" TEXT, ADD COLUMN "city" TEXT, ADD COLUMN "state" TEXT, ADD COLUMN "zip" TEXT,
  ADD COLUMN "ezlynxSentAt" TIMESTAMP(3), ADD COLUMN "ezlynxError" TEXT;
ALTER TABLE "User" ADD COLUMN "ezlynxUsername" TEXT;
ALTER TABLE "Contact" ADD COLUMN "ezlynxIntakeSentAt" TIMESTAMP(3);
ALTER TABLE "Document" ADD COLUMN "ezlynxSentAt" TIMESTAMP(3);
