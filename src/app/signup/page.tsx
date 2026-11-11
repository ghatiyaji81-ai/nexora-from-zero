import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth-form';
import { AuthPage } from '@/components/auth-page';

export const metadata: Metadata = { title: 'Create your account' };

export default function SignupPage() {
  return <AuthPage><AuthForm mode="signup" /></AuthPage>;
}
