import type { ReactNode } from "react"

function Section({ title, children }: { title: string; children: ReactNode }) {
	if (!children) return null
	return (
		<section className="border-t border-border px-5 py-4 first:border-t-0">
			<div className="mb-3 text-xs font-medium text-foreground">{title}</div>
			{children}
		</section>
	)
}

export default Section
