/*
  Warnings:

  - You are about to drop the `Voice` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "Voice";

-- CreateTable
CREATE TABLE "characters" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "tags" TEXT[],
    "category" TEXT NOT NULL,

    CONSTRAINT "characters_pkey" PRIMARY KEY ("id")
);
