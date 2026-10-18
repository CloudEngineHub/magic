import { useId } from "react"
import { observer } from "mobx-react-lite"
import { cn } from "@/utils/cn"
import { useOptionalPersonaResearchStore } from "../context"
import { BACK_HAIR, FRONT_HAIR, ageOf, genderOf, resolvePortrait } from "./personaPortrait"

interface PersonaAvatarProps {
	id: string
	name: string
	className?: string
	/**
	 * Gender and age from outside the research page (for example a chat tool card), used when the
	 * persona file is not loaded in a research store, so the portrait matches the research page.
	 */
	demographics?: Record<string, unknown>
	/** Square portraits (rounded 30%) lead persona cards and headers; circles are for lists. */
	shape?: "circle" | "square"
}

/**
 * Flat portrait for an AI persona, drawn from built-in templates. The name picks colours and
 * hairstyle so a persona always looks the same; gender and age come from its file when known.
 */
function PersonaAvatar({
	id,
	name,
	className,
	demographics: fallback,
	shape = "circle",
}: PersonaAvatarProps) {
	const store = useOptionalPersonaResearchStore()
	const demographics = store?.personaById(id)?.dimensions?.demographics ?? fallback
	const spec = resolvePortrait(name || id, genderOf(demographics), ageOf(demographics))
	const clipId = useId()
	const backHair = BACK_HAIR[spec.hairStyle]

	return (
		<span
			aria-hidden
			className={cn(
				"flex size-9 shrink-0 select-none overflow-hidden",
				shape === "square" ? "rounded-[30%]" : "rounded-full",
				className,
			)}
		>
			<svg viewBox="0 0 64 64" className="size-full">
				<defs>
					<clipPath id={clipId}>
						{shape === "square" ? (
							<rect width="64" height="64" />
						) : (
							<circle cx="32" cy="32" r="32" />
						)}
					</clipPath>
				</defs>
				<g clipPath={`url(#${clipId})`}>
					<rect width="64" height="64" fill={spec.backdrop} />
					{/* Portrait crop: head and shoulders fill the circle. */}
					<g transform="translate(-6.4 -5) scale(1.2)">
						<path d="M9 66C9 51 19 43.5 32 43.5S55 51 55 66Z" fill={spec.clothes} />
						{/* Long hair falls over the shoulders, so it is drawn after the body. */}
						{backHair ? <path d={backHair} fill={spec.hair} /> : null}
						<path d="M27.5 43.6L32 49.5L36.5 43.6Z" fill={spec.skin} />
						<rect x="28.6" y="35" width="6.8" height="9" rx="2" fill={spec.skin} />
						<rect x="28.6" y="35" width="6.8" height="3.4" fill="#000" opacity="0.08" />
						<ellipse cx="22.6" cy="28.6" rx="1.7" ry="2.4" fill={spec.skin} />
						<ellipse cx="41.4" cy="28.6" rx="1.7" ry="2.4" fill={spec.skin} />
						<ellipse cx="32" cy="27" rx="9.4" ry="11" fill={spec.skin} />
						<path d={FRONT_HAIR[spec.hairStyle]} fill={spec.hair} />
						{spec.glasses ? (
							<g fill="none" stroke="#2a2522" strokeWidth="0.9" opacity="0.75">
								<circle cx="28.2" cy="28" r="2.9" />
								<circle cx="35.8" cy="28" r="2.9" />
								<path d="M31.1 28H32.9" />
							</g>
						) : null}
					</g>
				</g>
			</svg>
		</span>
	)
}

export default observer(PersonaAvatar)
