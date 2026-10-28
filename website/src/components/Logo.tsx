/** The SynapseDC wordmark (brand/synapsedc-logo*.svg). `tone` picks the ink or the white version. */
export function Logo({ tone = "light", height = 30 }: { tone?: "dark" | "light"; height?: number }) {
	return <img src={tone === "light" ? "/brand/synapsedc-logo-white.svg" : "/brand/synapsedc-logo.svg"} alt="SynapseDC" height={height} width={Math.round(height * 6.46)} style={{ height, width: "auto" }} />;
}
