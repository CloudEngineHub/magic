import type { AnchorHTMLAttributes, ComponentProps } from "react"
import { cn } from "@/lib/utils"
import { parseMarkdownSpeakerLink, parseMarkdownTimeLink } from "../../utils/markdown-time-links"
import { resolveSpeakerChipStyle } from "../../utils/resolve-speaker-chip-style"

export type RecordingMarkdownLayout = "desktop" | "mobile"

export interface RecordingMarkdownComponentOptions {
	onSpeakerClick?: (speakerId: string) => void
	onTimeClick?: (seconds: number) => void
	timeLinkTestId?: string
	speakerLinkTestId?: string
}

/** Test hook for time chip class — styles live in `.recording-time-chip` (index.css). */
export const RECORDING_TIME_CHIP_CLASS = "recording-time-chip"

/** Builds ReactMarkdown overrides that require parsing, interaction, or extra DOM structure. */
export function createRecordingMarkdownComponents({
	onSpeakerClick,
	onTimeClick,
	timeLinkTestId = "recording-detail-time-link",
	speakerLinkTestId = "recording-detail-speaker-link",
}: RecordingMarkdownComponentOptions = {}) {
	return {
		a: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => (
			<MarkdownAnchor
				{...props}
				onSpeakerClick={onSpeakerClick}
				onTimeClick={onTimeClick}
				timeLinkTestId={timeLinkTestId}
				speakerLinkTestId={speakerLinkTestId}
			/>
		),
		code: (props: ComponentProps<"code">) => (
			<MarkdownCode {...props} onTimeClick={onTimeClick} timeLinkTestId={timeLinkTestId} />
		),
		// Wrapper div is required for isolated horizontal scroll; table cell styles use CSS.
		table: ({ children }: { children?: React.ReactNode }) => (
			<div className="recording-md-table-wrap">
				<table>{children}</table>
			</div>
		),
		// Read-only markdown must not toggle GFM task checkboxes.
		input: ({ checked, ...props }: ComponentProps<"input">) => (
			<input type="checkbox" checked={checked} readOnly {...props} />
		),
	}
}

/** Converts inline code-wrapped magic-time links into playable time controls. */
function MarkdownCode({
	children,
	onTimeClick,
	timeLinkTestId,
}: {
	children?: React.ReactNode
	onTimeClick?: (seconds: number) => void
	timeLinkTestId: string
}) {
	const text = String(children ?? "").trim()
	const match = text.match(/^\[([^\]]+)]\(magic-time:\/\/\/?([^)]+)\)$/)
	const seconds = match ? Number(match[2]) : null

	if (match && Number.isFinite(seconds)) {
		return (
			<RecordingTimeChip
				label={match[1]}
				seconds={seconds as number}
				onTimeClick={onTimeClick}
				testId={timeLinkTestId}
			/>
		)
	}

	return <code>{children}</code>
}

/** Keeps regular links intact while internal magic-time links seek the shared audio player. */
function MarkdownAnchor({
	href,
	children,
	onSpeakerClick,
	onTimeClick,
	timeLinkTestId,
	speakerLinkTestId,
	...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
	onSpeakerClick?: (speakerId: string) => void
	onTimeClick?: (seconds: number) => void
	timeLinkTestId: string
	speakerLinkTestId: string
}) {
	const seconds = parseMarkdownTimeLink(href)
	const speakerId = parseMarkdownSpeakerLink(href)

	if (seconds != null) {
		return (
			<RecordingTimeChip
				label={String(children ?? "")}
				seconds={seconds}
				onTimeClick={onTimeClick}
				testId={timeLinkTestId}
			/>
		)
	}

	if (speakerId) {
		const chipStyle = resolveSpeakerChipStyle(speakerId)
		return (
			<button
				type="button"
				className={cn("recording-speaker-chip", chipStyle.chip)}
				onClick={() => onSpeakerClick?.(speakerId)}
				data-testid={speakerLinkTestId}
				data-speaker-id={speakerId}
			>
				<span className={cn("recording-speaker-chip-dot", chipStyle.dot)} />
				{children}
			</button>
		)
	}

	return (
		<a {...rest} href={href} target="_blank" rel="noreferrer">
			{children}
		</a>
	)
}

/** Renders a prototype-style time chip that seeks playback on click. */
function RecordingTimeChip({
	label,
	seconds,
	onTimeClick,
	testId,
}: {
	label: string
	seconds: number
	onTimeClick?: (seconds: number) => void
	testId: string
}) {
	return (
		<button
			type="button"
			className={RECORDING_TIME_CHIP_CLASS}
			onClick={() => onTimeClick?.(seconds)}
			data-testid={testId}
		>
			{label}
		</button>
	)
}
