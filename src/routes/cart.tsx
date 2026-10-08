import { createFileRoute } from '@tanstack/react-router';
import { CartPage } from '@/components/order-pages';
import { pageHead } from '@/lib/metadata';
export const Route = createFileRoute('/cart')({head:()=>pageHead('Your Order','Review your customized Valley Grounds drinks and continue to demo checkout.'),component:CartPage});