import { ContentListPage } from "@/components/editor/content-list/ContentListPage";
import { pageAdapter } from "@/features/website-cms/resources/pageAdapter";

export function Pages() {
  return <ContentListPage adapter={pageAdapter} resourceLabel="Pages" createHref="/editor/pages/new" />;
}
