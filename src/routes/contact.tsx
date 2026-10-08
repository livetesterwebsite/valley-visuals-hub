import { createFileRoute } from '@tanstack/react-router';
import { ContactPage } from '@/components/brand-pages';
import { pageHead } from '@/lib/metadata';
export const Route = createFileRoute('/contact')({head:()=>pageHead('Contact Us','Say hello to Valley Grounds Coffee in Sherman Oaks. Find our address, phone and contact details.'),component:ContactPage});