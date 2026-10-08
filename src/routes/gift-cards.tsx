import { createFileRoute } from '@tanstack/react-router';
import { GiftCardsPage } from '@/components/brand-pages';
import { pageHead } from '@/lib/metadata';
export const Route = createFileRoute('/gift-cards')({head:()=>pageHead('Gift Cards','Gift your favorite person some good coffee with Valley Grounds demo digital gift cards.'),component:GiftCardsPage});