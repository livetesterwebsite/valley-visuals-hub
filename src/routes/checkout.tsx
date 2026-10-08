import { createFileRoute } from '@tanstack/react-router';
import { CheckoutPage } from '@/components/order-pages';
import { pageHead } from '@/lib/metadata';
export const Route = createFileRoute('/checkout')({head:()=>pageHead('Checkout','Complete your Valley Grounds demo order. No real payment is processed.'),component:CheckoutPage});