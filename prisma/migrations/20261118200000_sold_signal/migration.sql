-- Set when EZLynx (through Zapier) reports the person's opportunity as sold, before the policy report brings the policy itself.
ALTER TABLE "Contact" ADD COLUMN "soldAt" TIMESTAMP(3), ADD COLUMN "soldCarrier" TEXT, ADD COLUMN "soldLine" TEXT, ADD COLUMN "soldPremium" DECIMAL(12,2), ADD COLUMN "soldRef" TEXT;
