/*
  Warnings:

  - You are about to drop the `characters` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "characters";

-- CreateTable
CREATE TABLE "Character" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "tags" TEXT[],
    "category" TEXT NOT NULL,

    CONSTRAINT "Character_pkey" PRIMARY KEY ("id")
);
