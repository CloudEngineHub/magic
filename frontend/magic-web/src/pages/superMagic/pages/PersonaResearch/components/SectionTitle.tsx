/** Heading of a research home section, with an optional quiet hint beside it. */
export default function SectionTitle({ title, hint }: { title: string; hint?: string }) {
	return (
		<div className="flex items-baseline gap-3">
			<h2 className="text-lg font-bold tracking-tight text-foreground">{title}</h2>
			{hint ? <span className="text-[13px] text-muted-foreground">{hint}</span> : null}
		</div>
	)
}
