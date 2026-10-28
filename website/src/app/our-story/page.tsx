import { CompanyPage } from "@/components/company/CompanyPage";
import { ourStory } from "@/data/company";
import { buildMetadata } from "@/seo";

export const metadata = buildMetadata({ title: ourStory.metaTitle, description: ourStory.metaDesc, path: ourStory.path });

export default function OurStoryPage() {
	return <CompanyPage page={ourStory} />;
}
