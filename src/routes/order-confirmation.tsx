import { createFileRoute } from '@tanstack/react-router';
import { ConfirmationPage } from '@/components/order-pages';
import { pageHead } from '@/lib/metadata';
export const Route = createFileRoute('/order-confirmation')({head:()=>pageHead('You’re Grounded','Your Valley Grounds demo order details and pickup or delivery confirmation.'),component:ConfirmationPage});