import { createPortal } from "react-dom"
import { ChevronsUpDown } from "lucide-react"
import type { VisualPresetOption } from "../../types"
import { PresetRealCard } from "./PresetPreviewCards"

const PREVIEW_PANEL_WIDTH = 320
const PREVIEW_PANEL_GAP = 8
const PREVIEW_VIEWPORT_PADDING = 16
export const PREVIEW_CLOSE_DELAY_MS = 320

export interface PreviewState {
	left: number
	side: "left" | "right"
	top: number
	value: string
}

export function getPreviewPosition(
	trigger: HTMLElement,
	side: "left" | "right",
): Pick<PreviewState, "left" | "top"> {
	const rect = trigger.getBoundingClientRect()
	const viewportWidth =
		typeof window === "undefined" ? PREVIEW_PANEL_WIDTH * 2 : window.innerWidth
	const rawLeft =
		side === "left"
			? rect.left - PREVIEW_PANEL_WIDTH - PREVIEW_PANEL_GAP
			: rect.right + PREVIEW_PANEL_GAP
	const maxLeft = viewportWidth - PREVIEW_PANEL_WIDTH - PREVIEW_VIEWPORT_PADDING

	return {
		left: Math.max(PREVIEW_VIEWPORT_PADDING, Math.min(rawLeft, maxLeft)),
		top: rect.top + rect.height / 2,
	}
}

interface PresetHoverPreviewProps {
	description: string
	isOpen: boolean
	label: string
	onMouseEnter?: () => void
	onMouseLeave?: () => void
	position?: Pick<PreviewState, "left" | "top">
	preset: VisualPresetOption
	scrollHint: string
	side: "left" | "right"
}

export default function PresetHoverPreview({
	isOpen,
	position,
	preset,
	label,
	description,
	scrollHint,
	side,
	onMouseEnter,
	onMouseLeave,
}: PresetHoverPreviewProps) {
	if (!preset.preview || !isOpen || !position || typeof document === "undefined") return null
	const imageUrl = preset.preview.imageUrl

	return createPortal(
		<div
			aria-hidden="true"
			className="fixed z-[1000] w-[320px] max-w-[calc(100vw-32px)] -translate-y-1/2 rounded-2xl border border-zinc-200/70 bg-white p-2 text-left opacity-100 shadow-[0_18px_48px_rgba(24,24,27,0.13)] ring-1 ring-zinc-950/[0.04] transition-opacity duration-150"
			data-preview-side={side}
			data-preview-portal="body"
			data-testid={`visual-preset-hover-preview-${preset.value}`}
			data-self-media-preset-preview-image={imageUrl}
			data-self-media-preset-preview-source={preset.preview.sourcePath}
			onClick={(event) => event.stopPropagation()}
			onMouseDown={(event) => event.stopPropagation()}
			onMouseEnter={onMouseEnter}
			onMouseLeave={onMouseLeave}
			style={{ left: position.left, top: position.top }}
		>
			{imageUrl ? (
				<div className="relative">
					<div
						className="max-h-[min(48vh,360px)] overflow-y-auto rounded-xl border border-zinc-200/70 bg-zinc-100/70 shadow-inner"
						data-testid={`visual-preset-long-image-scroll-${preset.value}`}
					>
						<img
							alt=""
							className="block w-full select-none"
							data-testid={`visual-preset-long-image-${preset.value}`}
							draggable={false}
							src={imageUrl}
						/>
					</div>
					<div
						className="pointer-events-none absolute right-2 top-2 z-10 flex items-center gap-1 rounded-full border border-white/80 bg-zinc-950/90 px-2 py-1 text-[10px] font-[760] leading-none text-white shadow-[0_8px_22px_rgba(24,24,27,0.28)] ring-1 ring-zinc-950/10 backdrop-blur-md"
						data-testid={`visual-preset-scroll-hint-${preset.value}`}
					>
						<ChevronsUpDown aria-hidden="true" className="h-3 w-3" />
						<span>{scrollHint}</span>
					</div>
				</div>
			) : (
				<div className="grid grid-cols-2 gap-2">
					<PresetRealCard
						value={preset.value}
						variant="cover"
						testId={`visual-preset-real-card-${preset.value}-cover`}
					/>
					<PresetRealCard
						value={preset.value}
						variant="content"
						testId={`visual-preset-real-card-${preset.value}-content`}
					/>
				</div>
			)}
			<div
				className="mt-2 min-w-0 border-t border-zinc-200/70 px-1 pb-1 pt-2"
				data-testid={`visual-preset-hover-copy-${preset.value}`}
			>
				<div className="truncate text-[13px] font-[820] leading-tight text-[#18181b]">
					{label}
				</div>
				<div className="mt-1 line-clamp-2 text-[11px] font-[560] leading-snug text-[#71717a]">
					{description}
				</div>
			</div>
		</div>,
		document.body,
	)
}
