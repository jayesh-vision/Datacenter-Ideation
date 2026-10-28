import Link from "next/link";

export default function NotFound() {
	return (
		<section className="nf">
			<div>
				<h1>Page not found</h1>
				<p>The page you are looking for has moved or does not exist.</p>
				<Link href="/" className="btn btn-primary">
					Back to the home page
				</Link>
			</div>
		</section>
	);
}
