import 'server-only';
import { z } from 'zod';

const emailSchema = z.string().trim().toLowerCase().email().max(254);
const passwordSchema = z.string().min(12).max(128);

export const signupSchema = z.object({
  fullName: z.string().trim().min(2).max(80),
  email: emailSchema,
  password: passwordSchema,
  confirmPassword: z.string().min(1).max(128),
}).refine(values => values.password === values.confirmPassword, {
  message: 'Passwords do not match.',
  path: ['confirmPassword'],
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export const recoveryRequestSchema = z.object({ email: emailSchema });

export const passwordResetSchema = z.object({
  token: z.string().min(32).max(128),
  password: passwordSchema,
  confirmPassword: z.string().min(1).max(128),
}).refine(values => values.password === values.confirmPassword, {
  message: 'Passwords do not match.',
  path: ['confirmPassword'],
});

export function validationMessage(error: z.ZodError) {
  return error.issues[0]?.message ?? 'Please check the information and try again.';
}
