import { createFileRoute } from '@tanstack/react-router';
import { LoyaltyPage } from '@/components/loyalty-dashboard';
import { pageHead } from '@/lib/metadata';
export const Route = createFileRoute('/loyalty')({head:()=>pageHead('Valley Grounds Rewards','Sign in to view your real point balance, member tier, rewards and loyalty activity.'),component:LoyaltyPage});