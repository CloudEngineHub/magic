import { cn } from "@/utils/cn"

/**
 * Lightweight initial avatar; personas have no uploaded images.
 * A two-stop hue from the id gives each persona a stable, distinguishable mark.
 */
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
				"flex size-9 shrink-0 select-none items-center justify-center rounded-full text-sm font-medium text-white",
				className,
			)}
			// Inline gradient keeps avatars distinct without adding palette tokens per persona.
			style={{
				backgroundImage: `linear-gradient(135deg, hsl(${hash} 60% 58%), hsl(${(hash + 40) % 360} 55% 46%))`,
			}}
		>
			{name.slice(0, 1)}
		</span>
	)
}
