-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "QualScore" AS ENUM ('HOT', 'WARM', 'COLD');

-- CreateEnum
CREATE TYPE "HousingStatus" AS ENUM ('OWN', 'RENT', 'RENT_FREE');

-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('FULL_TIME', 'PART_TIME', 'SELF_EMPLOYED', 'UNEMPLOYED', 'RETIRED', 'STUDENT', 'OTHER');

-- CreateEnum
CREATE TYPE "DocType" AS ENUM ('GOVERNMENT_ID', 'PAY_STUB', 'BANK_STATEMENT', 'OFFER_LETTER', 'PET_DOCUMENTATION', 'OTHER');

-- CreateTable
CREATE TABLE "RentalApplication" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "contactId" TEXT,
    "propertyAddress" TEXT,
    "unitType" TEXT,
    "targetMoveIn" TIMESTAMP(3),
    "monthlyRent" DOUBLE PRECISION,
    "leaseTerm" TEXT,
    "occupantCount" INTEGER,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'DRAFT',
    "currentStep" INTEGER NOT NULL DEFAULT 1,
    "completedSteps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "summary" TEXT,
    "qualScore" "QualScore",
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RentalApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RentalApplicant" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "legalName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "idLastFour" TEXT,
    "currentAddress" TEXT,
    "housingStatus" "HousingStatus",
    "currentPayment" DOUBLE PRECISION,
    "lengthAtAddress" TEXT,
    "reasonForMoving" TEXT,
    "adultsOnApp" INTEGER,
    "children" INTEGER,
    "roommates" INTEGER,
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "employmentStatus" "EmploymentStatus",
    "employerName" TEXT,
    "monthlyGrossIncome" DOUBLE PRECISION,
    "additionalIncome" DOUBLE PRECISION,
    "currentLandlordName" TEXT,
    "currentLandlordPhone" TEXT,
    "prevLandlordName" TEXT,
    "prevLandlordPhone" TEXT,
    "rentPaidOnTime" BOOLEAN,
    "latePayments" INTEGER,
    "leaseViolations" BOOLEAN,
    "referencePermission" BOOLEAN,
    "priorEvictions" BOOLEAN,
    "outstandingBalances" BOOLEAN,
    "bankruptcy" BOOLEAN,
    "backgroundConsent" BOOLEAN,
    "hasPets" BOOLEAN,
    "petDetails" TEXT,
    "smokingDeclaration" BOOLEAN,
    "screeningConsent" BOOLEAN,
    "truthCertification" BOOLEAN,
    "electronicSignature" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RentalApplicant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationDocument" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "applicantId" TEXT,
    "type" "DocType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RentalApplication_spaceId_idx" ON "RentalApplication"("spaceId");

-- CreateIndex
CREATE INDEX "RentalApplication_contactId_idx" ON "RentalApplication"("contactId");

-- CreateIndex
CREATE INDEX "RentalApplicant_applicationId_idx" ON "RentalApplicant"("applicationId");

-- CreateIndex
CREATE INDEX "ApplicationDocument_applicationId_idx" ON "ApplicationDocument"("applicationId");

-- AddForeignKey
ALTER TABLE "RentalApplication" ADD CONSTRAINT "RentalApplication_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalApplication" ADD CONSTRAINT "RentalApplication_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentalApplicant" ADD CONSTRAINT "RentalApplicant_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "RentalApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationDocument" ADD CONSTRAINT "ApplicationDocument_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "RentalApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
