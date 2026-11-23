import { createFileRoute } from '@tanstack/react-router';
import { ResetPasswordPage } from '@/components/auth-pages';
import { pageHead } from '@/lib/metadata';

export const Route = createFileRoute('/reset-password')({
  head: () => pageHead('Reset your password', 'Choose a new password for your Valley Grounds Coffee rewards account.'),
  component: ResetPasswordPage,
});