-- The Quoted stage is no longer used: a person is an Applicant until the policy report makes them a Client.
-- The enum value stays in the database so old rows and history remain valid.
UPDATE "Contact" SET "stage" = 'APPLICANT' WHERE "stage" = 'QUOTED';
