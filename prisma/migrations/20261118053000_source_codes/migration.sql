-- Every referral source (business) gets a code agents can enter when adding an applicant.
ALTER TABLE "ReferralSource" ADD COLUMN "code" TEXT;

-- Give existing businesses a code from the same easy-to-read letters and digits as client codes.
UPDATE "ReferralSource" r SET "code" = (
  SELECT string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '')
  FROM generate_series(1, 7) WHERE r."id" IS NOT NULL
);

ALTER TABLE "ReferralSource" ALTER COLUMN "code" SET NOT NULL;
CREATE UNIQUE INDEX "ReferralSource_code_key" ON "ReferralSource"("code");
