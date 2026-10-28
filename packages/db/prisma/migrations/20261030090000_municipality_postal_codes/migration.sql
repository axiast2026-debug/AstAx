-- Dan, 2026-10-28: the postal codes (CAP) of each municipality, from seed/cap.csv
-- (GeoNames, CC BY 4.0). One CAP fills the field by itself, several give a choice.
ALTER TABLE "Municipality" ADD COLUMN "postalCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
