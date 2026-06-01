ALTER TABLE "RegenerationRun"
ADD COLUMN "articleLabelIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
