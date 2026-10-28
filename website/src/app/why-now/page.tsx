import { CompanyPage } from "@/components/company/CompanyPage";
import { whyNow } from "@/data/company";
import { buildMetadata } from "@/seo";

export const metadata = buildMetadata({ title: whyNow.metaTitle, description: whyNow.metaDesc, path: whyNow.path });

export default function WhyNowPage() {
	return <CompanyPage page={whyNow} />;
}
