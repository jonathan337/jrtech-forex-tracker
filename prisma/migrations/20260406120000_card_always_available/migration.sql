-- AlterTable
ALTER TABLE "Card" ADD COLUMN "alwaysAvailable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Card" ADD COLUMN "recurringAmountUSD" DOUBLE PRECISION;
ALTER TABLE "Card" ADD COLUMN "recurringExchangeRate" DOUBLE PRECISION;
ALTER TABLE "Card" ADD COLUMN "recurringPaymentDay" INTEGER;
ALTER TABLE "Card" ADD COLUMN "recurringFeeAmount" DOUBLE PRECISION;
ALTER TABLE "Card" ADD COLUMN "recurringFeeCurrency" TEXT;
ALTER TABLE "Card" ADD COLUMN "recurringNotes" TEXT;
