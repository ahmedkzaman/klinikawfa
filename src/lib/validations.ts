import { z } from 'zod';

// Auth validations
export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, { message: 'Sila masukkan email / Please enter email' })
    .email({ message: 'Email tidak sah / Invalid email' })
    .max(255, { message: 'Email terlalu panjang / Email too long' }),
  password: z
    .string()
    .min(1, { message: 'Sila masukkan kata laluan / Please enter password' })
    .min(6, { message: 'Kata laluan minimum 6 aksara / Password min 6 characters' }),
});

export const signUpSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, { message: 'Sila masukkan email / Please enter email' })
    .email({ message: 'Email tidak sah / Invalid email' })
    .max(255, { message: 'Email terlalu panjang / Email too long' }),
  password: z
    .string()
    .min(6, { message: 'Kata laluan minimum 6 aksara / Password min 6 characters' })
    .max(100, { message: 'Kata laluan terlalu panjang / Password too long' }),
  fullName: z
    .string()
    .trim()
    .max(100, { message: 'Nama terlalu panjang / Name too long' })
    .optional(),
});

export const resetPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, { message: 'Sila masukkan email / Please enter email' })
    .email({ message: 'Email tidak sah / Invalid email' })
    .max(255, { message: 'Email terlalu panjang / Email too long' }),
});

// Appointment validations
export const appointmentSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: 'Sila masukkan nama / Please enter name' })
    .max(100, { message: 'Nama terlalu panjang / Name too long' })
    .regex(/^[a-zA-Z\s'.@/-]+$/, { 
      message: 'Nama mengandungi aksara tidak sah / Name contains invalid characters' 
    }),
  phone: z
    .string()
    .trim()
    .min(1, { message: 'Sila masukkan nombor telefon / Please enter phone number' })
    .max(20, { message: 'Nombor telefon terlalu panjang / Phone number too long' })
    .regex(/^[+]?[0-9\s-]+$/, { 
      message: 'Nombor telefon tidak sah / Invalid phone number' 
    }),
  preferred_date: z
    .string()
    .min(1, { message: 'Sila pilih tarikh / Please select date' }),
  preferred_time: z
    .string()
    .min(1, { message: 'Sila pilih masa / Please select time' }),
  service: z
    .string()
    .min(1, { message: 'Sila pilih perkhidmatan / Please select service' }),
  message: z
    .string()
    .trim()
    .max(1000, { message: 'Mesej terlalu panjang / Message too long' })
    .optional(),
  pdpaConsent: z
    .boolean()
    .refine(val => val === true, { 
      message: 'Anda mesti bersetuju dengan polisi privasi / You must agree to the privacy policy' 
    }),
});

export type LoginFormData = z.infer<typeof loginSchema>;
export type SignUpFormData = z.infer<typeof signUpSchema>;
export type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;
export type AppointmentFormData = z.infer<typeof appointmentSchema>;
