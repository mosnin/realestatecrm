-- CreateEnum
CREATE TYPE "TelephonyType" AS ENUM ('RETELL_MANAGED', 'TWILIO');

-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('PENDING', 'ACTIVE', 'ERROR');

-- CreateEnum
CREATE TYPE "LeadScore" AS ENUM ('HOT', 'WARM', 'COLD');

-- CreateEnum
CREATE TYPE "LeadIntent" AS ENUM ('BUYER', 'SELLER', 'UNKNOWN');

-- CreateTable
CREATE TABLE "RetellAgent" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "retellAgentId" TEXT NOT NULL,
    "retellLlmId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "telephonyType" "TelephonyType" NOT NULL,
    "status" "AgentStatus" NOT NULL DEFAULT 'PENDING',
    "greetingText" TEXT NOT NULL,
    "brokerageName" TEXT NOT NULL,
    "primaryMarket" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetellAgent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "score" "LeadScore" NOT NULL DEFAULT 'COLD',
    "intent" "LeadIntent" NOT NULL DEFAULT 'UNKNOWN',
    "budget" TEXT,
    "timeline" TEXT,
    "preferredAreas" TEXT,
    "transcriptSummary" TEXT,
    "transcript" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RetellAgent_spaceId_key" ON "RetellAgent"("spaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_callId_key" ON "Lead"("callId");

-- AddForeignKey
ALTER TABLE "RetellAgent" ADD CONSTRAINT "RetellAgent_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;
