import { z } from 'zod';

export const PHONE_REGEX = /^[+]?[0-9\s-]+$/;

export const RELIGIONS = [
  'Islam',
  'Buddhism',
  'Christianity',
  'Hinduism',
  'Other',
  'Prefer not to say',
] as const;

export const ID_TYPES = ['mykad', 'passport', 'police', 'army'] as const;
export type IdType = (typeof ID_TYPES)[number];

export const ID_TYPE_OPTIONS: Array<{ value: IdType; label: string }> = [
  { value: 'mykad', label: 'MyKad / MyKid' },
  { value: 'police', label: 'Police ID' },
  { value: 'army', label: 'Army ID (Tentera)' },
  { value: 'passport', label: 'Passport' },
];

export const ID_TYPE_FIELD_LABEL: Record<IdType, string> = {
  mykad: 'MyKad / IC',
  police: 'Police ID Number',
  army: 'Army ID (Tentera)',
  passport: 'Passport',
};

export const ID_TYPE_PLACEHOLDER: Record<IdType, string> = {
  mykad: '12 digits',
  police: 'e.g. RF123456',
  army: 'e.g. T1234567',
  passport: 'e.g. A12345678',
};

export const patientSchema = z
  .object({
    id_type: z.enum(ID_TYPES).default('mykad'),
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
    phone: z
      .string()
      .trim()
      .min(1, 'Phone is required')
      .max(20)
      .regex(PHONE_REGEX, 'Invalid phone number'),
    national_id: z.string().trim().max(30).optional().or(z.literal('')),
    passport_no: z
      .string()
      .trim()
      .max(20, 'Passport must be ≤ 20 characters')
      .regex(/^[A-Za-z0-9]*$/, 'Passport must be alphanumeric')
      .optional()
      .or(z.literal('')),
    date_of_birth: z.string().optional(),
    gender: z.enum(['male', 'female', 'other', '']).optional(),
    email: z.string().trim().email('Invalid email').max(255).optional().or(z.literal('')),
    religion: z.string().min(1, 'Religion is required'),
    emergency_contact_name: z
      .string()
      .trim()
      .min(2, 'Emergency contact name is required')
      .max(120),
    emergency_contact_phone: z
      .string()
      .trim()
      .min(1, 'Emergency contact phone is required')
      .max(20)
      .regex(PHONE_REGEX, 'Invalid phone number'),
    default_panel_id: z.string().nullable().optional(),
    allergies: z.string().trim().max(500).optional(),
    underlying_conditions: z.string().trim().max(500).optional(),
    address: z.string().trim().max(500).optional(),
    panel_remarks: z.string().trim().max(500).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    const idType = data.id_type ?? 'mykad';
    const idVal = (data.national_id ?? '').trim();
    const passVal = (data.passport_no ?? '').trim();

    if (idType === 'mykad') {
      // Keep legacy "MyKad OR Passport" affordance.
      if (!idVal && !passVal) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['national_id'],
          message: 'Provide either MyKad or Passport No.',
        });
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['passport_no'],
          message: 'Provide either MyKad or Passport No.',
        });
      } else if (idVal && !/^\d{12}$/.test(idVal.replace(/[-\s]/g, ''))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['national_id'],
          message: 'MyKad must be 12 digits',
        });
      }
    } else if (idType === 'passport') {
      if (!passVal) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['passport_no'],
          message: 'Passport number is required',
        });
      }
    } else {
      // police / army
      if (idVal.length < 5) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['national_id'],
          message: `${ID_TYPE_FIELD_LABEL[idType]} is required (min 5 characters)`,
        });
      } else if (!/^[A-Za-z0-9-]+$/.test(idVal)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['national_id'],
          message: 'Only letters, numbers and dashes allowed',
        });
      }
    }
  });

export type PatientFormData = z.infer<typeof patientSchema>;
