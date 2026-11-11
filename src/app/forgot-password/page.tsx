import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth-form';
import { AuthPage } from '@/components/auth-page';

export const metadata: Metadata = { title: 'Recover your password' };

export default function ForgotPasswordPage() {
  return <AuthPage><AuthForm mode="recovery" /></AuthPage>;
}
