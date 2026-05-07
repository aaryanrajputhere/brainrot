-- CreateTable
CREATE TABLE "Voice" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "tags" TEXT[],
    "category" TEXT NOT NULL,

    CONSTRAINT "Voice_pkey" PRIMARY KEY ("id")
);
