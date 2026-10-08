import { createFileRoute } from '@tanstack/react-router';
import { LocationsPage } from '@/components/location-pages';
import { pageHead } from '@/lib/metadata';
export const Route = createFileRoute('/locations/')({head:()=>pageHead('Find a Cafe','Find Valley Grounds Coffee on Ventura Boulevard in Sherman Oaks and start your order.'),component:LocationsPage});