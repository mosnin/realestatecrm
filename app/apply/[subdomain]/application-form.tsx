'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { BrandLogo } from '@/components/brand-logo';
import Link from 'next/link';
import { track } from '@vercel/analytics';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Home,
  User,
  Building2,
  Users,
  Banknote,
  FileText,
  ShieldCheck,
  FolderOpen,
  PenLine,
  Loader2,
  CloudCheck,
  ChevronDown,
  CalendarDays,
  AlertCircle,
  Upload,
  X,
  FileCheck,
  UserPlus,
} from 'lucide-react';

// ─── Step metadata ────────────────────────────────────────────────────────────

const MAIN_STEPS = [
  { title: 'Property', subtitle: 'Which property are you applying for?', icon: Home },
  { title: 'About You', subtitle: 'Basic applicant information', icon: User },
  { title: 'Current Living', subtitle: 'Your current living situation', icon: Building2 },
  { title: 'Household', subtitle: 'Who will be living with you?', icon: Users },
  // Co-applicant steps are injected here (between index 4 and 5)
  { title: 'Income', subtitle: 'Employment and income details', icon: Banknote },
  { title: 'Rental History', subtitle: 'Your rental background', icon: FileText },
  { title: 'Screening', subtitle: 'Background disclosures', icon: ShieldCheck },
  { title: 'Documents', subtitle: 'Supporting documentation', icon: FolderOpen },
  { title: 'Review & Sign', subtitle: 'Confirm and submit', icon: PenLine },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface CoApplicant {
  name: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  employmentStatus: string;
  monthlyIncome: string;
}

interface UploadedFile {
  name: string;
  url: string;
  size: number;
  type: string;
  category: string;
}

interface ApplicationData {
  // Step 1
  propertyAddress: string;
  unitType: string;
  moveInDate: string;
  monthlyRent: string;
  leaseTerm: string;
  occupantCount: string;
  // Step 2
  legalName: string;
  email: string;
  phone: string;
  dateOfBirth: string;
  idLast4: string;
  // Step 3
  currentAddress: string;
  housingStatus: string;
  currentMonthlyPayment: string;
  lengthOfResidence: string;
  reasonForMoving: string;
  // Step 4
  adultsOnApplication: string;
  childrenCount: string;
  roommatesCount: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelation: string;
  // Dynamic co-applicants (filled by injected steps after step 4)
  coApplicants: CoApplicant[];
  // Step 5
  employmentStatus: string;
  employerName: string;
  monthlyIncome: string;
  additionalIncome: string;
  additionalIncomeSource: string;
  // Step 6
  currentLandlordName: string;
  currentLandlordPhone: string;
  previousLandlordName: string;
  previousLandlordPhone: string;
  monthlyRentPaid: string;
  hasLatePayments: string;
  latePaymentDetails: string;
  referencePermission: string;
  // Step 7
  priorEvictions: string;
  outstandingBalance: string;
  bankruptcy: string;
  backgroundAcknowledgment: string;
  smoking: string;
  pets: string;
  petDetails: string;
  // Step 8 – notes + uploaded file metadata
  documentsNotes: string;
  uploadedFiles: UploadedFile[];
  // Step 9
  consentToScreening: string;
  truthfulnessCertification: string;
  electronicSignature: string;
}

const EMPTY_CO_APPLICANT: CoApplicant = {
  name: '', email: '', phone: '', dateOfBirth: '', employmentStatus: '', monthlyIncome: '',
};

const EMPTY: ApplicationData = {
  propertyAddress: '', unitType: '', moveInDate: '', monthlyRent: '', leaseTerm: '', occupantCount: '',
  legalName: '', email: '', phone: '', dateOfBirth: '', idLast4: '',
  currentAddress: '', housingStatus: '', currentMonthlyPayment: '', lengthOfResidence: '', reasonForMoving: '',
  adultsOnApplication: '', childrenCount: '', roommatesCount: '', emergencyContactName: '', emergencyContactPhone: '', emergencyContactRelation: '',
  coApplicants: [],
  employmentStatus: '', employerName: '', monthlyIncome: '', additionalIncome: '', additionalIncomeSource: '',
  currentLandlordName: '', currentLandlordPhone: '', previousLandlordName: '', previousLandlordPhone: '', monthlyRentPaid: '', hasLatePayments: '', latePaymentDetails: '', referencePermission: '',
  priorEvictions: '', outstandingBalance: '', bankruptcy: '', backgroundAcknowledgment: '', smoking: '', pets: '', petDetails: '',
  documentsNotes: '',
  uploadedFiles: [],
  consentToScreening: '', truthfulnessCertification: '', electronicSignature: '',
};

// ─── Step sequence helpers ────────────────────────────────────────────────────

function coApplicantCount(adultsOnApplication: string): number {
  const n = parseInt(adultsOnApplication) || 1;
  // Max 3 co-applicant steps; "5+" counts as 5
  return Math.min(Math.max(n - 1, 0), 3);
}

type StepDescriptor =
  | { kind: 'main'; mainIndex: number } // 0-based index into MAIN_STEPS
  | { kind: 'coapplicant'; coIndex: number }; // 0-based co-applicant index

function buildStepSequence(adultsOnApplication: string): StepDescriptor[] {
  const coCount = coApplicantCount(adultsOnApplication);
  const seq: StepDescriptor[] = [];
  // Main steps 0–3 (Property, About You, Current Living, Household)
  for (let i = 0; i < 4; i++) seq.push({ kind: 'main', mainIndex: i });
  // Injected co-applicant steps
  for (let i = 0; i < coCount; i++) seq.push({ kind: 'coapplicant', coIndex: i });
  // Main steps 4–8 (Income, Rental History, Screening, Documents, Review & Sign)
  for (let i = 4; i < MAIN_STEPS.length; i++) seq.push({ kind: 'main', mainIndex: i });
  return seq;
}

function stepLabel(desc: StepDescriptor, total: number, index: number): { title: string; subtitle: string; icon: React.ElementType } {
  if (desc.kind === 'main') return MAIN_STEPS[desc.mainIndex];
  return {
    title: `Co-Applicant ${desc.coIndex + 1}`,
    subtitle: 'Additional applicant information',
    icon: UserPlus,
  };
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <Label className="text-sm font-medium text-foreground">
      {children}
      {required && <span className="text-destructive ml-1">*</span>}
    </Label>
  );
}

function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground mt-0.5">{children}</p>;
}

function FieldGroup({ children }: { children: React.ReactNode }) {
  return <div className="space-y-1.5">{children}</div>;
}

function SelectChip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 rounded-full text-sm font-medium border transition-all duration-150 cursor-pointer ${
        selected
          ? 'bg-primary text-primary-foreground border-primary shadow-sm'
          : 'bg-background text-muted-foreground border-border hover:border-primary/60 hover:text-foreground'
      }`}
    >
      {label}
    </button>
  );
}

function YesNoField({ label, hint, value, onChange, required }: {
  label: string; hint?: string; value: string; onChange: (v: string) => void; required?: boolean;
}) {
  return (
    <FieldGroup>
      <FieldLabel required={required}>{label}</FieldLabel>
      {hint && <FieldHint>{hint}</FieldHint>}
      <div className="flex gap-3 mt-1">
        {['Yes', 'No'].map((opt) => (
          <SelectChip key={opt} label={opt} selected={value === opt} onClick={() => onChange(value === opt ? '' : opt)} />
        ))}
      </div>
    </FieldGroup>
  );
}

function StyledSelect({ value, onChange, children, placeholder }: {
  value: string; onChange: (v: string) => void; children: React.ReactNode; placeholder?: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
        className="w-full h-10 px-3 pr-9 rounded-lg border border-input bg-background text-sm text-foreground appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring/40 transition-colors"
      >
        {placeholder && <option value="">{placeholder}</option>}
        {children}
      </select>
      <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
    </div>
  );
}

// ─── Step 1: Property ─────────────────────────────────────────────────────────

function Step1({ data, update }: { data: ApplicationData; update: (k: keyof ApplicationData, v: string) => void }) {
  const leaseOptions = ['Month-to-Month', '6 Months', '12 Months', '18 Months', '24 Months'];
  return (
    <div className="space-y-5">
      <FieldGroup>
        <FieldLabel required>Property address or listing</FieldLabel>
        <Input value={data.propertyAddress} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('propertyAddress', e.target.value)} placeholder="123 Maple Street, Unit 4B" />
        <FieldHint>Enter the address you saw listed, or type &quot;Not sure yet&quot;</FieldHint>
      </FieldGroup>
      <FieldGroup>
        <FieldLabel>Unit or bedroom type</FieldLabel>
        <StyledSelect value={data.unitType} onChange={(v) => update('unitType', v)} placeholder="Select a type">
          <option value="studio">Studio</option>
          <option value="1br">1 Bedroom</option>
          <option value="2br">2 Bedrooms</option>
          <option value="3br">3 Bedrooms</option>
          <option value="4br+">4+ Bedrooms</option>
          <option value="other">Other / Not sure</option>
        </StyledSelect>
      </FieldGroup>
      <div className="grid grid-cols-2 gap-4">
        <FieldGroup>
          <FieldLabel>Target move-in date</FieldLabel>
          <Input type="date" value={data.moveInDate} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('moveInDate', e.target.value)} />
        </FieldGroup>
        <FieldGroup>
          <FieldLabel>Monthly rent shown</FieldLabel>
          <Input value={data.monthlyRent} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('monthlyRent', e.target.value)} placeholder="$2,400" />
        </FieldGroup>
      </div>
      <FieldGroup>
        <FieldLabel>Lease term preference</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {leaseOptions.map((opt) => (
            <SelectChip key={opt} label={opt} selected={data.leaseTerm === opt} onClick={() => update('leaseTerm', data.leaseTerm === opt ? '' : opt)} />
          ))}
        </div>
      </FieldGroup>
      <FieldGroup>
        <FieldLabel>Total number of occupants</FieldLabel>
        <StyledSelect value={data.occupantCount} onChange={(v) => update('occupantCount', v)} placeholder="Select">
          {['1', '2', '3', '4', '5', '6+'].map((n) => (
            <option key={n} value={n}>{n} {n === '1' ? 'person' : 'people'}</option>
          ))}
        </StyledSelect>
        <FieldHint>Include everyone who will live in the unit</FieldHint>
      </FieldGroup>
    </div>
  );
}

// ─── Step 2: About You ────────────────────────────────────────────────────────

function Step2({ data, update }: { data: ApplicationData; update: (k: keyof ApplicationData, v: string) => void }) {
  return (
    <div className="space-y-5">
      <FieldGroup>
        <FieldLabel required>Legal full name</FieldLabel>
        <Input value={data.legalName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('legalName', e.target.value)} placeholder="First Middle Last" />
        <FieldHint>As it appears on your government-issued ID</FieldHint>
      </FieldGroup>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FieldGroup>
          <FieldLabel required>Email address</FieldLabel>
          <Input type="email" value={data.email} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('email', e.target.value)} placeholder="you@example.com" />
        </FieldGroup>
        <FieldGroup>
          <FieldLabel required>Mobile phone</FieldLabel>
          <Input type="tel" value={data.phone} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('phone', e.target.value)} placeholder="(555) 000-0000" />
        </FieldGroup>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FieldGroup>
          <FieldLabel>Date of birth</FieldLabel>
          <Input type="date" value={data.dateOfBirth} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('dateOfBirth', e.target.value)} />
        </FieldGroup>
        <FieldGroup>
          <FieldLabel>Last 4 digits of SSN</FieldLabel>
          <Input
            type="text"
            inputMode="numeric"
            maxLength={4}
            value={data.idLast4}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('idLast4', e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="0000"
          />
          <FieldHint>Optional — pre-screening only</FieldHint>
        </FieldGroup>
      </div>
    </div>
  );
}

// ─── Step 3: Current Living ───────────────────────────────────────────────────

function Step3({ data, update }: { data: ApplicationData; update: (k: keyof ApplicationData, v: string) => void }) {
  return (
    <div className="space-y-5">
      <FieldGroup>
        <FieldLabel>Current address</FieldLabel>
        <Input value={data.currentAddress} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('currentAddress', e.target.value)} placeholder="Street, City, State, ZIP" />
      </FieldGroup>
      <FieldGroup>
        <FieldLabel>Current housing status</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {[{ value: 'rent', label: 'Renting' }, { value: 'own', label: 'Owner' }, { value: 'rent-free', label: 'Rent-free' }].map(({ value, label }) => (
            <SelectChip key={value} label={label} selected={data.housingStatus === value} onClick={() => update('housingStatus', data.housingStatus === value ? '' : value)} />
          ))}
        </div>
      </FieldGroup>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FieldGroup>
          <FieldLabel>Current monthly payment</FieldLabel>
          <Input value={data.currentMonthlyPayment} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('currentMonthlyPayment', e.target.value)} placeholder="$1,800" />
        </FieldGroup>
        <FieldGroup>
          <FieldLabel>How long have you lived there?</FieldLabel>
          <StyledSelect value={data.lengthOfResidence} onChange={(v) => update('lengthOfResidence', v)} placeholder="Select">
            <option value="less-than-1">Less than 1 year</option>
            <option value="1-2">1–2 years</option>
            <option value="3-5">3–5 years</option>
            <option value="5+">5+ years</option>
          </StyledSelect>
        </FieldGroup>
      </div>
      <FieldGroup>
        <FieldLabel>Reason for moving</FieldLabel>
        <StyledSelect value={data.reasonForMoving} onChange={(v) => update('reasonForMoving', v)} placeholder="Select a reason">
          <option value="relocation">Job relocation</option>
          <option value="more-space">Need more space</option>
          <option value="less-space">Downsizing</option>
          <option value="cost">Lower cost</option>
          <option value="neighborhood">Better neighborhood</option>
          <option value="landlord">Landlord / lease issues</option>
          <option value="other">Other</option>
        </StyledSelect>
      </FieldGroup>
    </div>
  );
}

// ─── Step 4: Household ────────────────────────────────────────────────────────

function Step4({ data, update }: { data: ApplicationData; update: (k: keyof ApplicationData, v: string) => void }) {
  const coCount = coApplicantCount(data.adultsOnApplication);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        <FieldGroup>
          <FieldLabel>Adults</FieldLabel>
          <StyledSelect value={data.adultsOnApplication} onChange={(v) => update('adultsOnApplication', v)} placeholder="—">
            {['1', '2', '3', '4', '5+'].map((n) => <option key={n} value={n}>{n}</option>)}
          </StyledSelect>
          <FieldHint>On application</FieldHint>
        </FieldGroup>
        <FieldGroup>
          <FieldLabel>Children</FieldLabel>
          <StyledSelect value={data.childrenCount} onChange={(v) => update('childrenCount', v)} placeholder="—">
            {['0', '1', '2', '3', '4', '5+'].map((n) => <option key={n} value={n}>{n}</option>)}
          </StyledSelect>
          <FieldHint>Dependents</FieldHint>
        </FieldGroup>
        <FieldGroup>
          <FieldLabel>Roommates</FieldLabel>
          <StyledSelect value={data.roommatesCount} onChange={(v) => update('roommatesCount', v)} placeholder="—">
            {['0', '1', '2', '3', '4+'].map((n) => <option key={n} value={n}>{n}</option>)}
          </StyledSelect>
          <FieldHint>Co-renters</FieldHint>
        </FieldGroup>
      </div>

      {coCount > 0 && (
        <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs text-primary">
          <UserPlus size={14} className="shrink-0 mt-0.5" />
          <span>
            Next you&apos;ll fill in details for {coCount} co-applicant{coCount > 1 ? 's' : ''}. Each additional adult on the application needs their own section.
          </span>
        </div>
      )}

      <div className="pt-2 border-t border-border">
        <p className="text-sm font-medium text-foreground mb-4">Emergency contact</p>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FieldGroup>
              <FieldLabel>Full name</FieldLabel>
              <Input value={data.emergencyContactName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('emergencyContactName', e.target.value)} placeholder="Jane Smith" />
            </FieldGroup>
            <FieldGroup>
              <FieldLabel>Phone number</FieldLabel>
              <Input type="tel" value={data.emergencyContactPhone} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('emergencyContactPhone', e.target.value)} placeholder="(555) 000-0000" />
            </FieldGroup>
          </div>
          <FieldGroup>
            <FieldLabel>Relationship</FieldLabel>
            <StyledSelect value={data.emergencyContactRelation} onChange={(v) => update('emergencyContactRelation', v)} placeholder="Select">
              <option value="parent">Parent</option>
              <option value="sibling">Sibling</option>
              <option value="spouse">Spouse / Partner</option>
              <option value="friend">Friend</option>
              <option value="other">Other</option>
            </StyledSelect>
          </FieldGroup>
        </div>
      </div>
    </div>
  );
}

// ─── Co-Applicant step ────────────────────────────────────────────────────────

function StepCoApplicant({
  index,
  total,
  coApplicants,
  onChange,
}: {
  index: number;
  total: number;
  coApplicants: CoApplicant[];
  onChange: (updated: CoApplicant[]) => void;
}) {
  const ca = coApplicants[index] ?? { ...EMPTY_CO_APPLICANT };

  function set(field: keyof CoApplicant, value: string) {
    const updated = [...coApplicants];
    updated[index] = { ...(updated[index] ?? EMPTY_CO_APPLICANT), [field]: value };
    onChange(updated);
  }

  const statusOptions = [
    { value: 'employed', label: 'Employed' },
    { value: 'self-employed', label: 'Self-employed' },
    { value: 'retired', label: 'Retired' },
    { value: 'student', label: 'Student' },
    { value: 'other', label: 'Other' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/40 border border-border">
        <UserPlus size={14} className="text-muted-foreground shrink-0" />
        <p className="text-xs text-muted-foreground">
          Co-applicant {index + 1} of {total} — all adults named on the lease must be listed.
        </p>
      </div>
      <FieldGroup>
        <FieldLabel required>Legal full name</FieldLabel>
        <Input value={ca.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('name', e.target.value)} placeholder="First Middle Last" />
      </FieldGroup>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FieldGroup>
          <FieldLabel required>Email address</FieldLabel>
          <Input type="email" value={ca.email} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('email', e.target.value)} placeholder="co-applicant@example.com" />
        </FieldGroup>
        <FieldGroup>
          <FieldLabel required>Mobile phone</FieldLabel>
          <Input type="tel" value={ca.phone} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('phone', e.target.value)} placeholder="(555) 000-0000" />
        </FieldGroup>
      </div>
      <FieldGroup>
        <FieldLabel>Date of birth</FieldLabel>
        <Input type="date" value={ca.dateOfBirth} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('dateOfBirth', e.target.value)} />
      </FieldGroup>
      <FieldGroup>
        <FieldLabel>Employment status</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {statusOptions.map(({ value, label }) => (
            <SelectChip key={value} label={label} selected={ca.employmentStatus === value} onClick={() => set('employmentStatus', ca.employmentStatus === value ? '' : value)} />
          ))}
        </div>
      </FieldGroup>
      <FieldGroup>
        <FieldLabel required>Gross monthly income</FieldLabel>
        <Input value={ca.monthlyIncome} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('monthlyIncome', e.target.value)} placeholder="$4,500" />
        <FieldHint>Before taxes — combined with primary applicant income</FieldHint>
      </FieldGroup>
    </div>
  );
}

// ─── Step 5: Income ───────────────────────────────────────────────────────────

function Step5({ data, update }: { data: ApplicationData; update: (k: keyof ApplicationData, v: string) => void }) {
  return (
    <div className="space-y-5">
      <FieldGroup>
        <FieldLabel>Employment status</FieldLabel>
        <div className="flex flex-wrap gap-2">
          {[
            { value: 'employed', label: 'Employed' },
            { value: 'self-employed', label: 'Self-employed' },
            { value: 'retired', label: 'Retired' },
            { value: 'student', label: 'Student' },
            { value: 'other', label: 'Other' },
          ].map(({ value, label }) => (
            <SelectChip key={value} label={label} selected={data.employmentStatus === value} onClick={() => update('employmentStatus', data.employmentStatus === value ? '' : value)} />
          ))}
        </div>
      </FieldGroup>
      <FieldGroup>
        <FieldLabel>Employer or income source</FieldLabel>
        <Input value={data.employerName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('employerName', e.target.value)} placeholder="Company name or &quot;Self-employed&quot;" />
      </FieldGroup>
      <FieldGroup>
        <FieldLabel required>Gross monthly income</FieldLabel>
        <Input value={data.monthlyIncome} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('monthlyIncome', e.target.value)} placeholder="$5,000" />
        <FieldHint>Before taxes and deductions</FieldHint>
      </FieldGroup>
      <FieldGroup>
        <FieldLabel>Additional income (optional)</FieldLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input value={data.additionalIncome} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('additionalIncome', e.target.value)} placeholder="Amount (e.g. $500)" />
          <Input value={data.additionalIncomeSource} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('additionalIncomeSource', e.target.value)} placeholder="Source (e.g. freelance)" />
        </div>
      </FieldGroup>
    </div>
  );
}

// ─── Step 6: Rental History ───────────────────────────────────────────────────

function Step6({ data, update }: { data: ApplicationData; update: (k: keyof ApplicationData, v: string) => void }) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm font-medium text-foreground mb-3">Current landlord</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FieldGroup>
            <FieldLabel>Name</FieldLabel>
            <Input value={data.currentLandlordName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('currentLandlordName', e.target.value)} placeholder="Landlord name" />
          </FieldGroup>
          <FieldGroup>
            <FieldLabel>Phone</FieldLabel>
            <Input type="tel" value={data.currentLandlordPhone} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('currentLandlordPhone', e.target.value)} placeholder="(555) 000-0000" />
          </FieldGroup>
        </div>
      </div>
      <div className="pt-2 border-t border-border">
        <p className="text-sm font-medium text-foreground mb-3">Previous landlord <span className="font-normal text-muted-foreground">(optional)</span></p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FieldGroup>
            <FieldLabel>Name</FieldLabel>
            <Input value={data.previousLandlordName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('previousLandlordName', e.target.value)} placeholder="Landlord name" />
          </FieldGroup>
          <FieldGroup>
            <FieldLabel>Phone</FieldLabel>
            <Input type="tel" value={data.previousLandlordPhone} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('previousLandlordPhone', e.target.value)} placeholder="(555) 000-0000" />
          </FieldGroup>
        </div>
      </div>
      <FieldGroup>
        <FieldLabel>Current monthly rent paid</FieldLabel>
        <Input value={data.monthlyRentPaid} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('monthlyRentPaid', e.target.value)} placeholder="$1,800" />
      </FieldGroup>
      <YesNoField label="Any late payments or lease violations?" hint="In the past 5 years" value={data.hasLatePayments} onChange={(v) => update('hasLatePayments', v)} />
      {data.hasLatePayments === 'Yes' && (
        <FieldGroup>
          <FieldLabel>Please briefly explain</FieldLabel>
          <Textarea value={data.latePaymentDetails} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => update('latePaymentDetails', e.target.value)} placeholder="Briefly describe the situation..." rows={3} />
        </FieldGroup>
      )}
      <YesNoField label="May we contact your references?" hint="Your landlord(s) may be contacted as part of screening" value={data.referencePermission} onChange={(v) => update('referencePermission', v)} required />
    </div>
  );
}

// ─── Step 7: Screening ────────────────────────────────────────────────────────

function Step7({ data, update }: { data: ApplicationData; update: (k: keyof ApplicationData, v: string) => void }) {
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border border-border">
        <AlertCircle size={16} className="text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          These questions are required by law in most jurisdictions. Answering &quot;Yes&quot; does not automatically disqualify you.
        </p>
      </div>
      <YesNoField label="Have you ever been evicted?" value={data.priorEvictions} onChange={(v) => update('priorEvictions', v)} required />
      <YesNoField label="Do you have any outstanding balances owed to a landlord?" value={data.outstandingBalance} onChange={(v) => update('outstandingBalance', v)} required />
      <YesNoField label="Have you filed for bankruptcy in the past 7 years?" value={data.bankruptcy} onChange={(v) => update('bankruptcy', v)} />
      <YesNoField label="Will anyone in the household smoke on the premises?" value={data.smoking} onChange={(v) => update('smoking', v)} required />
      <YesNoField label="Do you have any pets?" value={data.pets} onChange={(v) => update('pets', v)} required />
      {data.pets === 'Yes' && (
        <FieldGroup>
          <FieldLabel>Describe your pet(s)</FieldLabel>
          <Input value={data.petDetails} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('petDetails', e.target.value)} placeholder="e.g. 2 cats, 1 dog (35 lbs, golden retriever)" />
        </FieldGroup>
      )}
      <FieldGroup>
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            id="bgAck"
            checked={data.backgroundAcknowledgment === 'yes'}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('backgroundAcknowledgment', e.target.checked ? 'yes' : '')}
            className="mt-1 h-4 w-4 rounded border-input accent-primary cursor-pointer"
          />
          <label htmlFor="bgAck" className="text-sm text-foreground leading-relaxed cursor-pointer">
            I understand that a background and credit check may be conducted as part of the screening process, subject to applicable law.
          </label>
        </div>
      </FieldGroup>
    </div>
  );
}

// ─── File upload widget ───────────────────────────────────────────────────────

interface DocUploadItemProps {
  label: string;
  category: string;
  subdomain: string;
  uploadedFiles: UploadedFile[];
  onUploaded: (f: UploadedFile) => void;
  onRemove: (url: string) => void;
}

function DocUploadItem({ label, category, subdomain, uploadedFiles, onUploaded, onRemove }: DocUploadItemProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const matching = uploadedFiles.filter((f) => f.category === category);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('subdomain', subdomain);
      fd.append('category', category);
      const res = await fetch('/api/public/upload', { method: 'POST', body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError((body as { error?: string }).error ?? 'Upload failed');
        return;
      }
      const uploaded = await res.json() as UploadedFile;
      onUploaded({ ...uploaded, category });
    } catch {
      setError('Network error — please try again.');
    } finally {
      setUploading(false);
      // Reset input so the same file can be re-uploaded after removal
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="rounded-lg border border-border bg-background overflow-hidden">
      <div className="flex items-center gap-3 p-3">
        <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center shrink-0">
          <FolderOpen size={13} className="text-muted-foreground" />
        </div>
        <span className="text-sm text-foreground flex-1 min-w-0">{label}</span>
        {uploading ? (
          <Loader2 size={15} className="animate-spin text-muted-foreground shrink-0" />
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="shrink-0 flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
          >
            <Upload size={13} />
            {matching.length > 0 ? 'Add more' : 'Upload'}
          </button>
        )}
        <input ref={inputRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic" onChange={handleChange} />
      </div>

      {matching.length > 0 && (
        <div className="border-t border-border divide-y divide-border">
          {matching.map((f) => (
            <div key={f.url} className="flex items-center gap-2 px-3 py-2">
              <FileCheck size={13} className="text-primary shrink-0" />
              <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-xs text-foreground truncate flex-1 hover:underline">
                {f.name}
              </a>
              <span className="text-xs text-muted-foreground shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
              <button type="button" onClick={() => onRemove(f.url)} className="text-muted-foreground hover:text-destructive transition-colors shrink-0">
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="px-3 pb-2 text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}

// ─── Step 8: Documents ────────────────────────────────────────────────────────

function Step8({
  data,
  update,
  subdomain,
  onFileUploaded,
  onFileRemoved,
}: {
  data: ApplicationData;
  update: (k: keyof ApplicationData, v: string) => void;
  subdomain: string;
  onFileUploaded: (f: UploadedFile) => void;
  onFileRemoved: (url: string) => void;
}) {
  const docItems: { label: string; category: string; show: boolean }[] = [
    { label: 'Government-issued ID (driver\'s license, passport, or state ID)', category: 'id', show: true },
    { label: 'Pay stubs or bank statements (last 2–3 months)', category: 'income', show: true },
    { label: 'Employment offer letter', category: 'offer-letter', show: data.employmentStatus === 'employed' },
    { label: 'Pet documentation (vaccination records, breed info)', category: 'pet-docs', show: data.pets === 'Yes' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 p-3 rounded-lg bg-accent border border-accent-foreground/10">
        <CheckCircle2 size={16} className="text-accent-foreground shrink-0 mt-0.5" />
        <p className="text-xs text-accent-foreground leading-relaxed">
          Upload your documents now or skip — your agent can send a secure link after submission. Files are stored privately and only shared with this agent.
        </p>
      </div>

      <div className="space-y-2">
        {docItems.filter((d) => d.show).map((d) => (
          <DocUploadItem
            key={d.category}
            label={d.label}
            category={d.category}
            subdomain={subdomain}
            uploadedFiles={data.uploadedFiles}
            onUploaded={onFileUploaded}
            onRemove={onFileRemoved}
          />
        ))}
      </div>

      <FieldGroup>
        <FieldLabel>Notes about your documents</FieldLabel>
        <Textarea
          value={data.documentsNotes}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => update('documentsNotes', e.target.value)}
          placeholder="Let your agent know if any documents are unavailable or need explanation..."
          rows={3}
        />
      </FieldGroup>
    </div>
  );
}

// ─── Step 9: Review & Sign ────────────────────────────────────────────────────

function Step9({ data, update, spaceName }: {
  data: ApplicationData;
  update: (k: keyof ApplicationData, v: string) => void;
  spaceName: string;
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-4 p-4 rounded-xl border border-border bg-muted/30">
        <p className="text-sm font-medium text-foreground">Review your application</p>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Applicant</span>
            <span className="font-medium">{data.legalName || '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Property</span>
            <span className="font-medium truncate max-w-[55%] text-right">{data.propertyAddress || '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Monthly income</span>
            <span className="font-medium">{data.monthlyIncome || '—'}</span>
          </div>
          {data.coApplicants.length > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Co-applicants</span>
              <span className="font-medium">{data.coApplicants.length}</span>
            </div>
          )}
          {data.uploadedFiles.length > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Documents uploaded</span>
              <span className="font-medium text-primary">{data.uploadedFiles.length}</span>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            id="consentScreening"
            checked={data.consentToScreening === 'yes'}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('consentToScreening', e.target.checked ? 'yes' : '')}
            className="mt-1 h-4 w-4 rounded border-input accent-primary cursor-pointer"
          />
          <label htmlFor="consentScreening" className="text-sm text-foreground leading-relaxed cursor-pointer">
            I consent to a background check, credit check, and rental history verification as part of this application.
          </label>
        </div>
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            id="truthfulness"
            checked={data.truthfulnessCertification === 'yes'}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('truthfulnessCertification', e.target.checked ? 'yes' : '')}
            className="mt-1 h-4 w-4 rounded border-input accent-primary cursor-pointer"
          />
          <label htmlFor="truthfulness" className="text-sm text-foreground leading-relaxed cursor-pointer">
            I certify that all information provided in this application is accurate and complete to the best of my knowledge.
          </label>
        </div>
      </div>

      <FieldGroup>
        <FieldLabel required>Electronic signature</FieldLabel>
        <Input
          value={data.electronicSignature}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('electronicSignature', e.target.value)}
          placeholder="Type your full legal name to sign"
        />
        <FieldHint>
          By typing your name, you agree to electronically sign this application and acknowledge that your information may be reviewed by {spaceName} for rental screening purposes.
        </FieldHint>
      </FieldGroup>

      <div className="p-3 rounded-lg border border-border bg-background text-xs text-muted-foreground leading-relaxed">
        By submitting, you confirm your information is accurate and may be reviewed for rental screening.
        Handled per our{' '}
        <Link href="/legal/privacy" className="underline hover:text-foreground transition-colors">Privacy Policy</Link>
        {' '}and{' '}
        <Link href="/legal/terms" className="underline hover:text-foreground transition-colors">Terms of Service</Link>.
      </div>
    </div>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ stepIndex, sequence }: { stepIndex: number; sequence: StepDescriptor[] }) {
  const total = sequence.length;
  const desc = sequence[stepIndex];
  const { title, subtitle, icon: Icon } = stepLabel(desc, total, stepIndex);
  const percent = Math.round(((stepIndex + 1) / total) * 100);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
            <Icon size={14} className="text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground leading-none">{title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium text-foreground">Step {stepIndex + 1} of {total}</p>
          <p className="text-xs text-muted-foreground">{percent}% done</p>
        </div>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

// ─── Success screen ───────────────────────────────────────────────────────────

function SuccessScreen({ name }: { name: string }) {
  return (
    <div className="text-center space-y-6 py-4">
      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
        <CheckCircle2 size={32} className="text-primary" />
      </div>
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          Application received
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          You&apos;re all set{name ? `, ${name.split(' ')[0]}` : ''}!
        </h2>
        <p className="text-muted-foreground text-sm leading-relaxed max-w-sm mx-auto">
          Your application has been submitted. The agent will review your information and follow up shortly.
        </p>
      </div>
      <div className="space-y-1 text-xs text-muted-foreground text-left max-w-xs mx-auto">
        <p className="font-medium">What happens next:</p>
        <ul className="space-y-1">
          <li>✓ Application logged in their system</li>
          <li>✓ Agent notified of your submission</li>
          <li>→ You&apos;ll hear back within 1–2 business days</li>
        </ul>
      </div>
    </div>
  );
}

// ─── Notes builder ────────────────────────────────────────────────────────────

const STORAGE_KEY_PREFIX = 'chippi_apply_';

function buildNotes(data: ApplicationData): string {
  const lines: string[] = ['=== Multi-Step Rental Application ==='];

  if (data.propertyAddress) lines.push(`Property: ${data.propertyAddress}`);
  if (data.unitType) lines.push(`Unit type: ${data.unitType}`);
  if (data.moveInDate) lines.push(`Move-in date: ${data.moveInDate}`);
  if (data.monthlyRent) lines.push(`Monthly rent: ${data.monthlyRent}`);
  if (data.leaseTerm) lines.push(`Lease term: ${data.leaseTerm}`);
  if (data.occupantCount) lines.push(`Occupants: ${data.occupantCount}`);

  lines.push('--- Applicant ---');
  if (data.dateOfBirth) lines.push(`DOB: ${data.dateOfBirth}`);
  if (data.idLast4) lines.push(`SSN last 4: ${data.idLast4}`);

  lines.push('--- Living Situation ---');
  if (data.currentAddress) lines.push(`Current address: ${data.currentAddress}`);
  if (data.housingStatus) lines.push(`Housing status: ${data.housingStatus}`);
  if (data.currentMonthlyPayment) lines.push(`Monthly payment: ${data.currentMonthlyPayment}`);
  if (data.lengthOfResidence) lines.push(`Length of residence: ${data.lengthOfResidence}`);
  if (data.reasonForMoving) lines.push(`Reason for moving: ${data.reasonForMoving}`);

  lines.push('--- Household ---');
  if (data.adultsOnApplication) lines.push(`Adults: ${data.adultsOnApplication}`);
  if (data.childrenCount) lines.push(`Children: ${data.childrenCount}`);
  if (data.roommatesCount) lines.push(`Roommates: ${data.roommatesCount}`);
  if (data.emergencyContactName) lines.push(`Emergency contact: ${data.emergencyContactName} (${data.emergencyContactRelation}) ${data.emergencyContactPhone}`);

  if (data.coApplicants.length > 0) {
    lines.push('--- Co-Applicants ---');
    data.coApplicants.forEach((ca, i) => {
      lines.push(`Co-applicant ${i + 1}: ${ca.name} | ${ca.email} | ${ca.phone} | DOB: ${ca.dateOfBirth} | Employment: ${ca.employmentStatus} | Income: ${ca.monthlyIncome}`);
    });
  }

  lines.push('--- Income ---');
  if (data.employmentStatus) lines.push(`Employment: ${data.employmentStatus}`);
  if (data.employerName) lines.push(`Employer: ${data.employerName}`);
  if (data.monthlyIncome) lines.push(`Monthly income: ${data.monthlyIncome}`);
  if (data.additionalIncome) lines.push(`Additional income: ${data.additionalIncome} (${data.additionalIncomeSource})`);

  lines.push('--- Rental History ---');
  if (data.currentLandlordName) lines.push(`Current landlord: ${data.currentLandlordName} ${data.currentLandlordPhone}`);
  if (data.previousLandlordName) lines.push(`Previous landlord: ${data.previousLandlordName} ${data.previousLandlordPhone}`);
  if (data.monthlyRentPaid) lines.push(`Rent paid: ${data.monthlyRentPaid}`);
  if (data.hasLatePayments) lines.push(`Late payments: ${data.hasLatePayments}`);
  if (data.latePaymentDetails) lines.push(`Late payment details: ${data.latePaymentDetails}`);
  if (data.referencePermission) lines.push(`Reference permission: ${data.referencePermission}`);

  lines.push('--- Screening ---');
  if (data.priorEvictions) lines.push(`Prior evictions: ${data.priorEvictions}`);
  if (data.outstandingBalance) lines.push(`Outstanding balance: ${data.outstandingBalance}`);
  if (data.bankruptcy) lines.push(`Bankruptcy: ${data.bankruptcy}`);
  if (data.smoking) lines.push(`Smoking: ${data.smoking}`);
  if (data.pets) lines.push(`Pets: ${data.pets}`);
  if (data.petDetails) lines.push(`Pet details: ${data.petDetails}`);

  if (data.uploadedFiles.length > 0) {
    lines.push('--- Uploaded Documents ---');
    data.uploadedFiles.forEach((f) => lines.push(`[${f.category}] ${f.name} — ${f.url}`));
  }

  if (data.documentsNotes) {
    lines.push('--- Document Notes ---');
    lines.push(data.documentsNotes);
  }

  if (data.electronicSignature) {
    lines.push('--- Signature ---');
    lines.push(`Signed: ${data.electronicSignature}`);
  }

  return lines.join('\n');
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ApplicationForm({
  subdomain,
  spaceName,
  pageTitle,
  pageIntro,
}: {
  subdomain: string;
  spaceName: string;
  pageTitle?: string;
  pageIntro?: string;
}) {
  const storageKey = `${STORAGE_KEY_PREFIX}${subdomain}`;
  const [stepIndex, setStepIndex] = useState(0);
  const [data, setData] = useState<ApplicationData>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [saveIndicator, setSaveIndicator] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [animDir, setAnimDir] = useState<'forward' | 'back'>('forward');
  const [visible, setVisible] = useState(true);
  const submissionLockRef = useRef(false);
  const analyticsStartFiredRef = useRef(false);

  // Recompute step sequence whenever adults-on-application changes
  const sequence = buildStepSequence(data.adultsOnApplication);
  const totalSteps = sequence.length;
  const currentDesc = sequence[stepIndex];

  // Fire application_started once on mount
  useEffect(() => {
    if (!analyticsStartFiredRef.current) {
      analyticsStartFiredRef.current = true;
      track('application_started', { subdomain });
    }
  }, [subdomain]);

  // Load saved progress on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as { stepIndex: number; data: ApplicationData };
        if (saved?.data) {
          setData({ ...EMPTY, ...saved.data });
          setStepIndex(saved.stepIndex ?? 0);
        }
      }
    } catch {
      // ignore parse errors
    }
  }, [storageKey]);

  const autosave = useCallback(
    (idx: number, currentData: ApplicationData) => {
      setSaveIndicator('saving');
      try {
        localStorage.setItem(storageKey, JSON.stringify({ stepIndex: idx, data: currentData }));
      } catch { /* ignore */ }
      setTimeout(() => setSaveIndicator('saved'), 600);
      setTimeout(() => setSaveIndicator('idle'), 2600);
    },
    [storageKey]
  );

  const update = useCallback((k: keyof ApplicationData, v: string) => {
    setData((prev) => ({ ...prev, [k]: v }));
    setErrors((prev) => {
      if (!prev[k]) return prev;
      const next = { ...prev };
      delete next[k];
      return next;
    });
  }, []);

  function updateCoApplicants(updated: CoApplicant[]) {
    setData((prev) => ({ ...prev, coApplicants: updated }));
  }

  function addUploadedFile(f: UploadedFile) {
    setData((prev) => ({ ...prev, uploadedFiles: [...prev.uploadedFiles, f] }));
  }

  function removeUploadedFile(url: string) {
    setData((prev) => ({ ...prev, uploadedFiles: prev.uploadedFiles.filter((f) => f.url !== url) }));
  }

  // Map the current step descriptor to a "main step number" (1-9) or co-applicant index
  function validate(desc: StepDescriptor): boolean {
    const errs: Record<string, string> = {};
    if (desc.kind === 'coapplicant') {
      const ca = data.coApplicants[desc.coIndex];
      if (!ca?.name?.trim()) errs[`ca_${desc.coIndex}_name`] = 'Name required';
      if (!ca?.phone?.trim()) errs[`ca_${desc.coIndex}_phone`] = 'Phone required';
      if (!ca?.monthlyIncome?.trim()) errs[`ca_${desc.coIndex}_income`] = 'Income required';
    } else {
      const m = desc.mainIndex;
      if (m === 0 && !data.propertyAddress.trim()) errs.propertyAddress = 'Property address is required';
      if (m === 1) {
        if (!data.legalName.trim()) errs.legalName = 'Legal name is required';
        if (!data.phone.trim()) errs.phone = 'Phone number is required';
        if (!data.email.trim()) errs.email = 'Email address is required';
      }
      if (m === 4 && !data.monthlyIncome.trim()) errs.monthlyIncome = 'Monthly income is required';
      if (m === 5 && !data.referencePermission) errs.referencePermission = 'Please answer this question';
      if (m === 6 && !data.backgroundAcknowledgment) errs.backgroundAcknowledgment = 'Please acknowledge to continue';
      if (m === 8) {
        if (!data.consentToScreening) errs.consentToScreening = 'Consent required';
        if (!data.truthfulnessCertification) errs.truthfulnessCertification = 'Certification required';
        if (!data.electronicSignature.trim()) errs.electronicSignature = 'Signature required';
      }
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function goTo(idx: number, dir: 'forward' | 'back') {
    setVisible(false);
    setAnimDir(dir);
    setTimeout(() => {
      setStepIndex(idx);
      setVisible(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 180);
  }

  function handleNext() {
    if (!validate(currentDesc)) return;
    const nextIdx = stepIndex + 1;
    // Fire analytics for completed step
    const meta = stepLabel(currentDesc, totalSteps, stepIndex);
    track('application_step_completed', { subdomain, step: stepIndex + 1, stepTitle: meta.title });
    autosave(nextIdx, data);
    goTo(nextIdx, 'forward');
  }

  function handleBack() {
    goTo(stepIndex - 1, 'back');
  }

  async function handleSubmit() {
    if (!validate(currentDesc)) return;
    if (submitting || submissionLockRef.current) return;
    submissionLockRef.current = true;
    setSubmitting(true);

    const payload = {
      subdomain,
      name: data.legalName,
      email: data.email,
      phone: data.phone,
      budget: data.monthlyRent ? data.monthlyRent.replace(/[^0-9.]/g, '') : null,
      timeline: data.moveInDate || null,
      preferredAreas: data.propertyAddress || null,
      notes: buildNotes(data),
      applicationType: 'multi-step',
    };

    try {
      const res = await fetch('/api/public/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        track('application_submitted', {
          subdomain,
          coApplicants: data.coApplicants.length,
          documentsUploaded: data.uploadedFiles.length,
        });
        setSubmitted(true);
        try { localStorage.removeItem(storageKey); } catch { /* ignore */ }
      } else {
        setErrors({ _form: 'Something went wrong. Please try again.' });
      }
    } finally {
      setSubmitting(false);
      submissionLockRef.current = false;
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col bg-[#f5f6f8]">
        <header className="w-full border-b border-border bg-white/80 backdrop-blur-sm">
          <div className="max-w-2xl mx-auto px-4 h-14 flex items-center">
            <BrandLogo className="h-6" alt="Chippi" />
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center px-4 py-16">
          <div className="w-full max-w-md bg-white rounded-2xl border border-border shadow-sm p-8">
            <SuccessScreen name={data.legalName} />
          </div>
        </main>
        <PageFooter />
      </div>
    );
  }

  const isLastStep = stepIndex === totalSteps - 1;

  return (
    <div className="min-h-screen flex flex-col bg-[#f5f6f8]">
      {/* Sticky header */}
      <header className="w-full border-b border-border bg-white/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <BrandLogo className="h-6" alt="Chippi" />
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {saveIndicator === 'saving' && (
              <><Loader2 size={12} className="animate-spin" /><span>Saving…</span></>
            )}
            {saveIndicator === 'saved' && (
              <><CloudCheck size={12} className="text-primary" /><span className="text-primary">Saved</span></>
            )}
            {saveIndicator === 'idle' && (
              <span className="text-muted-foreground/60">Progress auto-saved</span>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-8 space-y-5">
        {/* Intro — only on step 0 */}
        {stepIndex === 0 && (
          <div className="space-y-2">
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              {pageTitle ?? `Apply with ${spaceName}`}
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {pageIntro ?? "Share your rental preferences and we'll follow up with next steps."}
            </p>
            <div className="flex items-center gap-4 pt-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarDays size={12} />
                <span>About 5 minutes</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CloudCheck size={12} />
                <span>Progress auto-saved</span>
              </div>
            </div>
          </div>
        )}

        {/* Progress bar */}
        <div className="bg-white rounded-2xl border border-border shadow-sm p-4 sm:p-5">
          <ProgressBar stepIndex={stepIndex} sequence={sequence} />
        </div>

        {/* Step card */}
        <div
          className="bg-white rounded-2xl border border-border shadow-sm p-5 sm:p-7 transition-all duration-200"
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : animDir === 'forward' ? 'translateY(8px)' : 'translateY(-8px)',
          }}
        >
          {currentDesc.kind === 'main' && currentDesc.mainIndex === 0 && <Step1 data={data} update={update} />}
          {currentDesc.kind === 'main' && currentDesc.mainIndex === 1 && <Step2 data={data} update={update} />}
          {currentDesc.kind === 'main' && currentDesc.mainIndex === 2 && <Step3 data={data} update={update} />}
          {currentDesc.kind === 'main' && currentDesc.mainIndex === 3 && <Step4 data={data} update={update} />}
          {currentDesc.kind === 'coapplicant' && (
            <StepCoApplicant
              index={currentDesc.coIndex}
              total={coApplicantCount(data.adultsOnApplication)}
              coApplicants={data.coApplicants}
              onChange={updateCoApplicants}
            />
          )}
          {currentDesc.kind === 'main' && currentDesc.mainIndex === 4 && <Step5 data={data} update={update} />}
          {currentDesc.kind === 'main' && currentDesc.mainIndex === 5 && <Step6 data={data} update={update} />}
          {currentDesc.kind === 'main' && currentDesc.mainIndex === 6 && <Step7 data={data} update={update} />}
          {currentDesc.kind === 'main' && currentDesc.mainIndex === 7 && (
            <Step8
              data={data}
              update={update}
              subdomain={subdomain}
              onFileUploaded={addUploadedFile}
              onFileRemoved={removeUploadedFile}
            />
          )}
          {currentDesc.kind === 'main' && currentDesc.mainIndex === 8 && (
            <Step9 data={data} update={update} spaceName={spaceName} />
          )}

          {/* Validation errors */}
          {Object.keys(errors).filter((k) => k !== '_form').length > 0 && (
            <div className="mt-4 flex items-start gap-2 text-destructive text-xs">
              <AlertCircle size={13} className="shrink-0 mt-0.5" />
              <span>Please fill in the required fields above.</span>
            </div>
          )}
          {errors._form && (
            <div className="mt-4 flex items-start gap-2 text-destructive text-xs">
              <AlertCircle size={13} className="shrink-0 mt-0.5" />
              <span>{errors._form}</span>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-3">
          {stepIndex > 0 && (
            <Button type="button" variant="outline" onClick={handleBack} disabled={submitting} className="h-11 px-5 rounded-xl gap-2">
              <ArrowLeft size={15} />
              Back
            </Button>
          )}
          <Button type="button" onClick={isLastStep ? handleSubmit : handleNext} disabled={submitting} className="flex-1 h-11 rounded-xl gap-2 font-medium">
            {submitting ? (
              <><Loader2 size={15} className="animate-spin" />Submitting…</>
            ) : isLastStep ? (
              <><CheckCircle2 size={15} />Submit application</>
            ) : (
              <>Continue<ArrowRight size={15} /></>
            )}
          </Button>
        </div>
      </main>

      <PageFooter />
    </div>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function PageFooter() {
  return (
    <footer className="w-full border-t border-border bg-white/60 mt-8">
      <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <BrandLogo className="h-4" alt="Chippi" />
          <span className="text-muted-foreground/60">·</span>
          <span>Powered by Chippi</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/legal/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
          <Link href="/legal/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
          <Link href="/legal/cookies" className="hover:text-foreground transition-colors">Cookies</Link>
        </div>
      </div>
    </footer>
  );
}
