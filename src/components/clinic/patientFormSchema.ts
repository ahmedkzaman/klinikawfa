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

export const patientSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120),
    phone: z
      .string()
      .trim()
      .min(1, 'Phone is required')
      .max(20)
      .regex(PHONE_REGEX, 'Invalid phone number'),
    national_id: z
      .string()
      .trim()
      .optional()
      .refine((v) => !v || /^[0-9]{12}$/.test(v.replace(/[-\s]/g, '')), {
        message: 'MyKad must be 12 digits',
      }),
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
  })
  .superRefine((data, ctx) => {
    const hasIc = !!data.national_id?.trim();
    const hasPassport = !!data.passport_no?.trim();
    if (!hasIc && !hasPassport) {
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
    }
  });

export type PatientFormData = z.infer<typeof patientSchema>;
