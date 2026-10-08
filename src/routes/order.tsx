import { createFileRoute } from '@tanstack/react-router';
import { OrderPage } from '@/components/order-pages';
import { pageHead } from '@/lib/metadata';
export const Route = createFileRoute('/order')({head:()=>pageHead('Order Ahead','Select your Valley Grounds café and customize your next coffee for pickup or demo delivery.'),component:OrderPage});