import { createFileRoute } from '@tanstack/react-router';
import { Catalog } from '@/components/catalog-view';
import { PageTop } from '@/components/page-top';
import { pageHead } from '@/lib/metadata';
export const Route = createFileRoute('/menu')({ head:()=>pageHead('The Menu','Explore Valley Grounds signature lattes, coffee, matcha, teas and more in Sherman Oaks.'), component:MenuPage });
function MenuPage(){return <><PageTop kicker="HANDCRAFTED. HEART-FIRST. ALL VALLEY." title="THE GOOD STUFF." description="From your daily ritual to your next obsession. Find your flavor."/><Catalog/></>;}