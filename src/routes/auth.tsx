import { createFileRoute } from '@tanstack/react-router';
import { AuthPage } from '@/components/auth-pages';
import { pageHead } from '@/lib/metadata';

export const Route = createFileRoute('/auth')({
  head: () => pageHead('Member sign in', 'Sign in or create a Valley Grounds Coffee rewards account.'),
  component: AuthPage,
});