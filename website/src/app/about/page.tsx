import { CompanyPage } from "@/components/company/CompanyPage";
import { about } from "@/data/company";
import { buildMetadata } from "@/seo";

export const metadata = buildMetadata({ title: about.metaTitle, description: about.metaDesc, path: about.path });

export default function AboutPage() {
	return <CompanyPage page={about} />;
}
