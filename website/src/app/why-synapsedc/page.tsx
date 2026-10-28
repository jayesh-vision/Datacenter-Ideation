import { CompanyPage } from "@/components/company/CompanyPage";
import { whyUs } from "@/data/company";
import { buildMetadata } from "@/seo";

export const metadata = buildMetadata({ title: whyUs.metaTitle, description: whyUs.metaDesc, path: whyUs.path });

export default function WhyUsPage() {
	return <CompanyPage page={whyUs} />;
}
