import { createFileRoute } from '@tanstack/react-router';
import { StoryPage } from '@/components/brand-pages';
import { pageHead } from '@/lib/metadata';
export const Route = createFileRoute('/our-story')({head:()=>pageHead('Our Story','Coffee, community and good energy. Meet Valley Grounds Coffee and our Sherman Oaks home.'),component:StoryPage});