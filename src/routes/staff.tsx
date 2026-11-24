import { createFileRoute } from '@tanstack/react-router';
import { StaffPage } from '@/components/staff-dashboard';
import { pageHead } from '@/lib/metadata';

export const Route = createFileRoute('/staff')({
  head: () => pageHead('Staff tools', 'Valley Grounds team tools for member lookup, purchase points and reward codes.'),
  component: StaffPage,
});
