ALTER TABLE "DocumentLineItem" DROP CONSTRAINT IF EXISTS "DocumentLineItem_documentId_fkey";
DROP TABLE IF EXISTS "DocumentLineItem";
ALTER TABLE "Document" ADD COLUMN "lineItemsData" JSONB;
