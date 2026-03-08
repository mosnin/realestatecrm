-- CreateTable
CREATE TABLE "AgentFlow" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "nodes" JSONB NOT NULL DEFAULT '[]',
    "edges" JSONB NOT NULL DEFAULT '[]',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentFlow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentFlow_spaceId_key" ON "AgentFlow"("spaceId");

-- AddForeignKey
ALTER TABLE "AgentFlow" ADD CONSTRAINT "AgentFlow_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;
