import { cn } from "@/utils/cn"

/** Lightweight initial avatar; personas have no uploaded images. Hue is derived from the id. */
export default function PersonaAvatar({
	id,
	name,
	className,
}: {
	id: string
	name: string
	className?: string
}) {
	let hash = 0
	for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) % 360
	return (
		<span
			aria-hidden
			className={cn(
				"flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-medium text-white",
				className,
			)}
			// Inline hue keeps avatars distinguishable without adding palette tokens per persona.
			style={{ backgroundColor: `hsl(${hash} 45% 52%)` }}
		>
			{name.slice(0, 1)}
		</span>
	)
}
