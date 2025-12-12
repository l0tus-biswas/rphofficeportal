export interface OnboardingStep {
  fileName?: string;
  originalName?: string;
  mimeType?: string;
  size?: number;
  uploadedAt?: Date;
  status: 'pending' | 'approved' | 'rejected' | 'missing';
  adminComment?: string;
  history?: OnboardingHistory[];
}

export interface OnboardingHistory {
  status: string;
  comment?: string;
  updatedBy?: string;
  updatedAt: Date;
}

export interface OnboardingNote {
  message: string;
  createdBy: {
    _id: string;
    name: string;
    role: string;
  };
  role: string;
  createdAt: Date;
}

export interface Onboarding {
  _id: string;
  user: string | any;
  steps: {
    stateLicense: OnboardingStep;
    driversLicense: OnboardingStep;
    fingerprintBackground: OnboardingStep;
    cmsCertificate: OnboardingStep;
    directDeposit: OnboardingStep;
  };
  status: 'not-started' | 'pending' | 'approved' | 'rejected' | 'missing';
  submittedAt?: Date;
  reviewedAt?: Date;
  reviewedBy?: string;
  notes: OnboardingNote[];
  lastUpdatedBy?: string;
  lastUpdatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface OnboardingStepMeta {
  key: string;
  label: string;
  title: string;
  description: string;
  required: boolean;
  icon: string;
}

export const ONBOARDING_STEPS: OnboardingStepMeta[] = [
  {
    key: 'stateLicense',
    label: 'State License',
    title: 'State License',
    description: 'Upload your valid state license (PDF only)',
    required: true,
    icon: 'bi bi-file-earmark-text'
  },
  {
    key: 'driversLicense',
    label: "Driver's License",
    title: "Driver's License",
    description: "Upload a clear copy of your driver's license (PDF only)",
    required: true,
    icon: 'bi bi-credit-card-2-front'
  },
  {
    key: 'fingerprintBackground',
    label: 'Fingerprint Background Check',
    title: 'Fingerprint Background Check',
    description: 'Upload your fingerprint background check results (PDF only)',
    required: true,
    icon: 'bi bi-fingerprint'
  },
  {
    key: 'cmsCertificate',
    label: 'Medicare (CMS) Certificate',
    title: 'Medicare (CMS) Certificate',
    description: 'Upload your CMS certification (PDF only)',
    required: true,
    icon: 'bi bi-award'
  },
  {
    key: 'directDeposit',
    label: 'Direct Deposit Form',
    title: 'Direct Deposit Form',
    description: 'Upload completed direct deposit authorization form (PDF only)',
    required: true,
    icon: 'bi bi-bank'
  }
];
