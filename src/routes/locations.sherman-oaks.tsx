import { createFileRoute } from '@tanstack/react-router';
import { StorePage } from '@/components/location-pages';
import { pageHead } from '@/lib/metadata';
export const Route = createFileRoute('/locations/sherman-oaks')({head:()=>pageHead('Sherman Oaks Cafe','Visit Valley Grounds Coffee at 14524 Ventura Blvd, Sherman Oaks, CA 91403.'),component:StorePage});