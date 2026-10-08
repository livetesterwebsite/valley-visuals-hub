import { createFileRoute } from "@tanstack/react-router";
import { HomePage } from '@/components/home-page';
export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: 'Valley Grounds Coffee | Coffee Shop in Sherman Oaks' },
    { name: 'description', content: 'Valley Grounds Coffee serves handcrafted coffee, matcha, tea and signature drinks in Sherman Oaks. Find a cafe, order ahead and get grounded in the Valley.' },
    { property: 'og:title', content: 'Valley Grounds Coffee | Coffee Shop in Sherman Oaks' },
    { property: 'og:description', content: 'Handcrafted coffee, matcha, tea and signature drinks. Good energy in Sherman Oaks.' },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary_large_image' },
  ] }),
  component: HomePage,
});
