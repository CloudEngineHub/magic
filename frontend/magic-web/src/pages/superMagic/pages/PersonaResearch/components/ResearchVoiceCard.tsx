import { useEffect, useMemo, useState } from "react"
import { AudioLines, ChevronRight } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/utils/cn"
import type { PersonaFile } from "../types"
import PersonaAvatar from "./PersonaAvatar"
import { EASE_OUT } from "./surface"
import { personaTone } from "./personaPortrait"

const ROTATE_MS = 5200
const MAX_VOICES = 4

interface Voice {
	persona: PersonaFile
	text: string
}

/** First quotable line of a persona: how they talk (expression layer), else an evidence quote. */
export function personaVoiceLine(persona: PersonaFile): string | null {
	for (const item of persona.layers?.expression ?? []) {
		if (typeof item === "string" && item.trim()) return item.trim()
		if (item && typeof item === "object" && "text" in item) {
			const text = String((item as { text: unknown }).text ?? "").trim()
			if (text) return text
		}
	}
	return persona.evidence?.find((item) => item.quote?.trim())?.quote?.trim() ?? null
}

interface ResearchVoiceCardProps {
	personas: PersonaFile[]
	onOpenLibrary: () => void
	className?: string
}

/**
 * Home hero visual: real lines from the user's persona library, one at a time on the speaker's
 * colour. It replaces drawn illustration; with no quotable persona the card is not rendered.
 */
export default function ResearchVoiceCard({
	personas,
	onOpenLibrary,
	className,
}: ResearchVoiceCardProps) {
	const { t } = useTranslation("personaResearch")
	const voices = useMemo<Voice[]>(
		() =>
			personas
				.map((persona) => ({ persona, text: personaVoiceLine(persona) }))
				.filter((voice): voice is Voice => Boolean(voice.text))
				.slice(0, MAX_VOICES),
		[personas],
	)
	const [index, setIndex] = useState(0)
	const [visible, setVisible] = useState(true)

	useEffect(() => {
		if (voices.length < 2) return
		if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
		let fadeTimer: number | undefined
		// Fade the text out, swap the voice, fade back in; the card colour eases with it.
		const timer = window.setInterval(() => {
			setVisible(false)
			fadeTimer = window.setTimeout(() => {
				setIndex((value) => (value + 1) % voices.length)
				setVisible(true)
			}, 320)
		}, ROTATE_MS)
		return () => {
			window.clearInterval(timer)
			window.clearTimeout(fadeTimer)
		}
	}, [voices.length])

	if (voices.length === 0) return null
	const voice = voices[index % voices.length]
	const { persona } = voice
	const { tone } = personaTone(persona.name || persona.id)
	const demographics = persona.dimensions?.demographics
	const meta = [
		demographics?.age ? t("voice.age", { age: String(demographics.age) }) : null,
		persona.tagline,
	]
		.filter(Boolean)
		.join(" · ")

	return (
		<aside
			className={cn(
				"relative flex min-h-[360px] flex-col overflow-hidden rounded-[22px] py-6 pl-11 pr-7 text-white transition-colors duration-500",
				className,
			)}
			style={{ backgroundColor: tone }}
			aria-live="polite"
			data-testid="persona-research-voice-card"
		>
			<span className="flex items-center gap-1.5 text-xs text-white/75">
				<AudioLines className="size-4" />
				{t("voice.label")}
			</span>
			<div
				className={cn(
					// The quote leaves and returns through a slight blur and lift, not a hard cut.
					"flex flex-1 flex-col justify-center gap-5 transition-[opacity,filter,transform] duration-300",
					EASE_OUT,
					visible
						? "translate-y-0 opacity-100 blur-0"
						: "translate-y-1 opacity-0 blur-[2px]",
				)}
			>
				{/* Opening mark hangs outside the text block so the quote's left edge stays clean. */}
				<p className="relative line-clamp-5 text-balance text-2xl font-black leading-normal tracking-tight before:absolute before:right-full before:content-['“'] after:content-['”']">
					{voice.text}
				</p>
				<span className="flex items-center gap-2.5 text-[13px]">
					<PersonaAvatar
						id={persona.id}
						name={persona.name}
						className="size-10 ring-2 ring-white/35"
					/>
					<span className="flex min-w-0 flex-col">
						<span className="font-medium">{persona.name}</span>
						<span className="line-clamp-1 text-xs text-white/70">
							{meta ? `${meta} · ` : ""}
							{t("persona.aiSimulated")}
						</span>
					</span>
				</span>
			</div>
			<div className="mt-5 flex items-center justify-between border-t border-white/20 pt-3.5 text-[12.5px]">
				<button
					type="button"
					className="inline-flex items-center gap-1 rounded text-white/90 outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-white/70"
					onClick={onOpenLibrary}
				>
					{t("voice.fromLibrary")}
					<ChevronRight className="size-3.5" />
				</button>
				{voices.length > 1 ? (
					<span className="flex items-center gap-1.5" aria-hidden>
						{voices.map((item, dot) => (
							<span
								key={item.persona.id}
								className={cn(
									"h-1.5 rounded-full transition-all duration-300",
									dot === index % voices.length
										? "w-[18px] bg-white"
										: "w-1.5 bg-white/35",
								)}
							/>
						))}
					</span>
				) : null}
			</div>
		</aside>
	)
}
