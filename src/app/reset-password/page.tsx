import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth-form';
import { AuthPage } from '@/components/auth-page';

export const metadata: Metadata = { title: 'Reset your password' };

export default function ResetPasswordPage() {
  return <AuthPage><AuthForm mode="reset" /></AuthPage>;
}
