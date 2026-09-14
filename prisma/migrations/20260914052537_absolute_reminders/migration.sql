-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "absoluteReminders" TIMESTAMP(3)[] DEFAULT ARRAY[]::TIMESTAMP(3)[];
