ALTER TABLE "Contact" ADD COLUMN "referralCode" TEXT, ADD COLUMN "referredById" TEXT, ADD COLUMN "referredAt" TIMESTAMP(3), ADD COLUMN "referralRewardedAt" TIMESTAMP(3);

-- Give every existing contact a 7 character code from an alphabet without look-alike characters.
UPDATE "Contact" SET "referralCode" = (
  SELECT string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '')
  FROM generate_series(1, 7) WHERE "Contact"."id" IS NOT NULL
);

CREATE UNIQUE INDEX "Contact_referralCode_key" ON "Contact"("referralCode");
CREATE INDEX "Contact_referredAt_idx" ON "Contact"("referredAt");
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
