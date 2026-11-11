import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth-form';
import { AuthPage } from '@/components/auth-page';

export const metadata: Metadata = { title: 'Sign in' };

export default function LoginPage() {
  return <AuthPage><AuthForm mode="login" /></AuthPage>;
}
