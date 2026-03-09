// TypeScript types for the Rental Application feature

export type ApplicationStatus =
  | 'DRAFT'
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED';

export type QualScore = 'HOT' | 'WARM' | 'COLD';

export type HousingStatus = 'OWN' | 'RENT' | 'RENT_FREE';

export type EmploymentStatus =
  | 'FULL_TIME'
  | 'PART_TIME'
  | 'SELF_EMPLOYED'
  | 'UNEMPLOYED'
  | 'RETIRED'
  | 'STUDENT'
  | 'OTHER';

export type DocType =
  | 'GOVERNMENT_ID'
  | 'PAY_STUB'
  | 'BANK_STATEMENT'
  | 'OFFER_LETTER'
  | 'PET_DOCUMENTATION'
  | 'OTHER';

export interface RentalApplicant {
  id: string;
  applicationId: string;
  isPrimary: boolean;

  // Basics
  legalName: string | null;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | Date | null;
  idLastFour: string | null;

  // Living situation
  currentAddress: string | null;
  housingStatus: HousingStatus | null;
  currentPayment: number | null;
  lengthAtAddress: string | null;
  reasonForMoving: string | null;

  // Household
  adultsOnApp: number | null;
  children: number | null;
  roommates: number | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;

  // Income
  employmentStatus: EmploymentStatus | null;
  employerName: string | null;
  monthlyGrossIncome: number | null;
  additionalIncome: number | null;

  // Rental history
  currentLandlordName: string | null;
  currentLandlordPhone: string | null;
  prevLandlordName: string | null;
  prevLandlordPhone: string | null;
  rentPaidOnTime: boolean | null;
  latePayments: number | null;
  leaseViolations: boolean | null;
  referencePermission: boolean | null;

  // Screening
  priorEvictions: boolean | null;
  outstandingBalances: boolean | null;
  bankruptcy: boolean | null;
  backgroundConsent: boolean | null;
  hasPets: boolean | null;
  petDetails: string | null;
  smokingDeclaration: boolean | null;

  // Consents
  screeningConsent: boolean | null;
  truthCertification: boolean | null;
  electronicSignature: string | null;

  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface ApplicationDocument {
  id: string;
  applicationId: string;
  applicantId: string | null;
  type: DocType;
  fileName: string;
  fileUrl: string;
  uploadedAt: string | Date;
}

export interface RentalApplication {
  id: string;
  spaceId: string;
  contactId: string | null;

  // Property
  propertyAddress: string | null;
  unitType: string | null;
  targetMoveIn: string | Date | null;
  monthlyRent: number | null;
  leaseTerm: string | null;
  occupantCount: number | null;

  // Status
  status: ApplicationStatus;
  currentStep: number;
  completedSteps: string[];

  // Qualification
  summary: string | null;
  qualScore: QualScore | null;

  submittedAt: string | Date | null;
  createdAt: string | Date;
  updatedAt: string | Date;

  applicants?: RentalApplicant[];
  documents?: ApplicationDocument[];
}

// Wizard form data shape (matches all steps combined)
export interface ApplicationFormData {
  // Step 1: Property
  propertyAddress: string;
  unitType: string;
  targetMoveIn: string;
  monthlyRent: string;
  leaseTerm: string;
  occupantCount: string;

  // Step 2: Applicant Basics
  legalName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  idLastFour: string;

  // Step 3: Living + Household
  currentAddress: string;
  housingStatus: HousingStatus | '';
  currentPayment: string;
  lengthAtAddress: string;
  reasonForMoving: string;
  adultsOnApp: string;
  children: string;
  roommates: string;
  emergencyContactName: string;
  emergencyContactPhone: string;

  // Step 4: Income
  employmentStatus: EmploymentStatus | '';
  employerName: string;
  monthlyGrossIncome: string;
  additionalIncome: string;

  // Step 5: Rental History
  currentLandlordName: string;
  currentLandlordPhone: string;
  prevLandlordName: string;
  prevLandlordPhone: string;
  rentPaidOnTime: boolean | null;
  latePayments: string;
  leaseViolations: boolean | null;
  referencePermission: boolean | null;

  // Step 6: Screening
  priorEvictions: boolean | null;
  outstandingBalances: boolean | null;
  bankruptcy: boolean | null;
  backgroundConsent: boolean | null;
  hasPets: boolean | null;
  petDetails: string;
  smokingDeclaration: boolean | null;

  // Step 7: Consents
  hasGovId: boolean;
  hasPayStubs: boolean;
  hasBankStatements: boolean;
  screeningConsent: boolean;
  truthCertification: boolean;
  electronicSignature: string;
}

// Persisted state in localStorage
export interface PersistedAppState {
  applicationId: string | null;
  currentStep: number;
  formData: Partial<ApplicationFormData>;
}
