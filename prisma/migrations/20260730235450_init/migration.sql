-- CreateTable
CREATE TABLE "ResearchRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "query" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answer" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "SubQuestionRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "findingContent" TEXT,
    "confidence" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "sources" TEXT NOT NULL,
    CONSTRAINT "SubQuestionRecord_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ResearchRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
