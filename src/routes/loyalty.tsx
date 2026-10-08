import { createFileRoute } from '@tanstack/react-router';
import { LoyaltyPage } from '@/components/brand-pages';
import { pageHead } from '@/lib/metadata';
export const Route = createFileRoute('/loyalty')({head:()=>pageHead('Join the Valley','Discover Valley Grounds rewards, birthday perks and member-only good energy.'),component:LoyaltyPage});