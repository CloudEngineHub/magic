import { useEffect, useMemo, useRef } from "react"
import { UsersRound } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import type { RecordingTranscriptSegment } from "../../types/recording-detail"
import { formatRecordingTime } from "../../utils/time"
import { ScrollEdgeFadeContainer } from "@/components/base-mobile/ScrollEdgeFade"
import { RecordingDetailEmptyState } from "./RecordingDetailEmptyState"
import { RecordingDetailRegionEmptySlot } from "./RecordingDetailRegionEmptySlot"
import { useRecordingDetailCapabilities } from "./RecordingDetailProvider"
import {
	getTranscriptSegmentRowClassName,
	type TranscriptPlaybackVisualState,
	getTranscriptSegmentTextClassName,
	getTranscriptSegmentTimeClassName,
	getTranscriptSpeakerChipToneClassName,
} from "./transcript-segment-styles"
import { RecordingSpeakerFilterControl } from "./RecordingSpeakerFilterControl"

const TRANSCRIPT_HEADER_ACTION_BASE_CLASS =
	"inline-flex shrink-0 items-center justify-center border border-black/10 bg-white text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors hover:bg-muted/30"
const TRANSCRIPT_HEADER_PILL_ACTION_CLASS = `${TRANSCRIPT_HEADER_ACTION_BASE_CLASS} h-8 rounded-full px-3 text-[12px] font-medium leading-none`

/** Centers a transcript row inside its dedicated scroll port without moving ancestor layouts. */
function centerTranscriptSegment(scrollPort: HTMLDivElement, segment: HTMLElement) {
	const scrollPortRect = scrollPort.getBoundingClientRect()
	const segmentRect = segment.getBoundingClientRect()
	const segmentTop = scrollPort.scrollTop + segmentRect.top - scrollPortRect.top
	const centeredScrollTop = segmentTop - (scrollPort.clientHeight - segmentRect.height) / 2
	const maxScrollTop = Math.max(0, scrollPort.scrollHeight - scrollPort.clientHeight)

	// Native scrollIntoView may also scroll overflow-hidden ancestors, so scroll only this list viewport.
	scrollPort.scrollTo({
		top: Math.min(Math.max(0, centeredScrollTop), maxScrollTop),
		behavior: "smooth",
	})
}

interface RecordingDetailTranscriptPanelProps {
	segments: RecordingTranscriptSegment[]
	availableSpeakerIds: string[]
	playing: boolean
	currentTime: number
	selectedSpeakerIds: string[]
	speakerNameMap: Record<string, string>
	showSpeakerFilter?: boolean
	totalSegmentsCount?: number
	onSegmentClick: (segment: RecordingTranscriptSegment) => void
	onSelectedSpeakerIdsChange: (speakerIds: string[]) => void
	onOpenSpeakerSettings: () => void
}

/** Renders seekable transcript segments with playback highlight and speaker pills. */
export function RecordingDetailTranscriptPanel({
	segments,
	availableSpeakerIds,
	playing,
	currentTime,
	selectedSpeakerIds,
	speakerNameMap,
	showSpeakerFilter = true,
	totalSegmentsCount,
	onSegmentClick,
	onSelectedSpeakerIdsChange,
	onOpenSpeakerSettings,
}: RecordingDetailTranscriptPanelProps) {
	const { t } = useTranslation("audioRecordings")
	const capabilities = useRecordingDetailCapabilities()
	const activeSegmentId = useMemo(
		// Playback highlight only represents live playback, not a paused seek position.
		() => (playing ? findActiveSegmentId(segments, currentTime) : null),
		[segments, currentTime, playing],
	)
	const listRef = useRef<HTMLDivElement>(null)
	const scrollPortRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (!activeSegmentId || !listRef.current || !scrollPortRef.current) return
		const node = listRef.current.querySelector(`[data-segment-id="${activeSegmentId}"]`)
		if (node instanceof HTMLElement) {
			centerTranscriptSegment(scrollPortRef.current, node)
		}
	}, [activeSegmentId])
	const speakerLabels = useMemo(
		() =>
			Object.fromEntries(
				availableSpeakerIds.map((speakerId) => [
					speakerId,
					speakerNameMap[speakerId] ?? speakerId,
				]),
			),
		[availableSpeakerIds, speakerNameMap],
	)
	const countLabel =
		totalSegmentsCount != null && totalSegmentsCount !== segments.length
			? t("detail.transcriptVisibleCount", {
					visibleCount: segments.length,
					totalCount: totalSegmentsCount,
				})
			: t("detail.transcriptSegmentCountSuffix", { count: segments.length })

	return (
		<div
			className="flex min-h-0 flex-1 flex-col overflow-hidden"
			data-testid="recording-detail-transcript-panel"
		>
			<div className="flex items-center justify-between px-2 pb-4 pt-2">
				<div className="flex min-w-0 items-baseline gap-2">
					<h2
						className="shrink-0 text-[18px] font-semibold leading-7 text-foreground"
						data-testid="recording-detail-transcript-title"
					>
						{t("detail.tabs.transcript")}
					</h2>
					<span
						className="truncate text-sm font-normal leading-5 text-muted-foreground"
						data-testid="recording-detail-transcript-count"
					>
						{countLabel}
					</span>
				</div>
				<div className="flex shrink-0 items-center gap-2">
					{capabilities.canEditSpeakers ? (
						<button
							type="button"
							className={cn(
								TRANSCRIPT_HEADER_PILL_ACTION_CLASS,
								"gap-1.5 disabled:cursor-not-allowed disabled:opacity-50",
							)}
							onClick={onOpenSpeakerSettings}
							disabled={availableSpeakerIds.length === 0}
							data-testid="recording-detail-open-speaker-settings"
						>
							{/* Keep this decorative icon aligned with the prototype while the button text remains the accessible label. */}
							<UsersRound
								className="size-4 shrink-0"
								strokeWidth={2}
								aria-hidden="true"
								data-testid="recording-detail-speaker-settings-icon"
							/>
							{t("detail.openSpeakerSettings")}
						</button>
					) : null}
					{showSpeakerFilter ? (
						<RecordingSpeakerFilterControl
							speakerIds={availableSpeakerIds}
							selectedIds={selectedSpeakerIds}
							onChange={onSelectedSpeakerIdsChange}
							labels={speakerLabels}
							title={t("detail.speakerFilterTitle")}
							presentation="menu"
						/>
					) : null}
				</div>
			</div>

			<ScrollEdgeFadeContainer
				// The transcript should read like a plain content column, so fades blend into the page shell instead of a card.
				fadeColor="background"
				className="min-h-[320px] flex-1"
				scrollClassName="px-4 pb-3 [scrollbar-width:thin]"
				contentDeps={[segments.length]}
				scrollPortRef={scrollPortRef}
			>
				{segments.length === 0 ? (
					<RecordingDetailRegionEmptySlot>
						{totalSegmentsCount != null && totalSegmentsCount > 0 ? (
							<p
								className="text-center text-sm text-muted-foreground"
								data-testid="recording-detail-transcript-filter-empty"
							>
								{t("detail.emptyTranscriptFiltered")}
							</p>
						) : (
							<RecordingDetailEmptyState variant="noTranscript" compact />
						)}
					</RecordingDetailRegionEmptySlot>
				) : (
					<div ref={listRef} className="flex flex-col gap-3 pb-4">
						{segments.map((segment) => {
							const isActive = segment.id === activeSegmentId
							// Non-playing transcript rows should render at full reading contrast; dimming is reserved for live playback context.
							const visualState: TranscriptPlaybackVisualState = !playing
								? "idle"
								: isActive
									? "active"
									: "dimmed"
							return (
								<div
									key={segment.id}
									role="button"
									tabIndex={0}
									data-segment-id={segment.id}
									// Keep desktop rows on a stable box model and express focus through text contrast.
									className={cn(
										getTranscriptSegmentRowClassName("desktop"),
										"transition-colors",
									)}
									onClick={() => onSegmentClick(segment)}
									onKeyDown={(event) => {
										if (event.key === "Enter" || event.key === " ") {
											event.preventDefault()
											onSegmentClick(segment)
										}
									}}
									data-testid="recording-detail-transcript-segment"
								>
									<div className="mb-1 flex flex-wrap items-center gap-2 text-xs font-medium">
										<span
											className={getTranscriptSegmentTimeClassName(
												visualState,
											)}
										>
											{formatRecordingTime(segment.start)}
										</span>
										{segment.speaker ? (
											<TranscriptSpeakerChip
												speakerId={segment.speaker}
												label={
													speakerNameMap[segment.speaker] ??
													segment.speaker
												}
												visualState={visualState}
												canEdit={capabilities.canEditSpeakers}
												onOpenSpeakerSettings={onOpenSpeakerSettings}
											/>
										) : null}
									</div>
									<p
										className={getTranscriptSegmentTextClassName(
											visualState,
											"desktop",
										)}
									>
										{segment.text}
									</p>
								</div>
							)
						})}
					</div>
				)}
			</ScrollEdgeFadeContainer>
		</div>
	)
}

import { resolveSpeakerChipStyle } from "../../utils/resolve-speaker-chip-style"

/** Renders a prototype-style speaker pill; opens settings on click when editing is allowed. */
function TranscriptSpeakerChip({
	speakerId,
	label,
	visualState,
	canEdit,
	onOpenSpeakerSettings,
}: {
	speakerId: string
	label: string
	visualState: TranscriptPlaybackVisualState
	canEdit: boolean
	onOpenSpeakerSettings: () => void
}) {
	const chipStyle = resolveSpeakerChipStyle(speakerId)
	const chipClassName = cn(
		"inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] leading-4 text-foreground",
		chipStyle.chip,
		getTranscriptSpeakerChipToneClassName(visualState),
		canEdit ? "transition-opacity hover:opacity-80" : undefined,
	)
	const chipContent = (
		<>
			<span className={cn("mr-1 size-1.5 shrink-0 rounded-full", chipStyle.dot)} />
			{label}
		</>
	)

	if (!canEdit) {
		return (
			<span className={chipClassName} data-testid="recording-detail-transcript-speaker-chip">
				{chipContent}
			</span>
		)
	}

	return (
		<button
			type="button"
			className={chipClassName}
			onClick={(event) => {
				event.stopPropagation()
				onOpenSpeakerSettings()
			}}
			data-testid="recording-detail-transcript-speaker-chip"
		>
			{chipContent}
		</button>
	)
}

/** Finds the segment currently playing based on the shared audio currentTime. */
function findActiveSegmentId(
	segments: RecordingTranscriptSegment[],
	currentTime: number,
): string | null {
	for (const segment of segments) {
		const end = segment.end ?? segment.start
		if (currentTime >= segment.start && currentTime < end) return segment.id
	}
	return null
}
