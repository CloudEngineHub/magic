import { useEffect, useMemo, useRef } from "react"
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
	getTranscriptSegmentTextClassName,
	getTranscriptSegmentTimeClassName,
	getTranscriptSpeakerChipToneClassName,
} from "./transcript-segment-styles"

interface RecordingDetailTranscriptPanelProps {
	segments: RecordingTranscriptSegment[]
	currentTime: number
	speakerNameMap: Record<string, string>
	onSegmentClick: (segment: RecordingTranscriptSegment) => void
	onOpenSpeakerSettings: () => void
}

/** Renders seekable transcript segments with playback highlight and speaker pills. */
export function RecordingDetailTranscriptPanel({
	segments,
	currentTime,
	speakerNameMap,
	onSegmentClick,
	onOpenSpeakerSettings,
}: RecordingDetailTranscriptPanelProps) {
	const { t } = useTranslation("audioRecordings")
	const capabilities = useRecordingDetailCapabilities()
	const activeSegmentId = useMemo(
		() => findActiveSegmentId(segments, currentTime),
		[segments, currentTime],
	)
	const listRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		if (!activeSegmentId || !listRef.current) return
		const node = listRef.current.querySelector(`[data-segment-id="${activeSegmentId}"]`)
		if (node instanceof HTMLElement) {
			node.scrollIntoView({ block: "center", behavior: "smooth" })
		}
	}, [activeSegmentId])

	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card">
			<div className="flex items-center justify-between border-b border-border px-4 py-3">
				<h2 className="text-sm font-semibold text-foreground">
					{t("detail.transcriptCount", { count: segments.length })}
				</h2>
				{capabilities.canEditSpeakers ? (
					<button
						type="button"
						className={cn(
							"inline-flex h-8 items-center rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors",
							"hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50",
						)}
						onClick={onOpenSpeakerSettings}
						disabled={segments.length === 0}
						data-testid="recording-detail-open-speaker-settings"
					>
						{t("detail.openSpeakerSettings")}
					</button>
				) : null}
			</div>

			<ScrollEdgeFadeContainer
				fadeColor="card"
				className="min-h-[320px] flex-1"
				scrollClassName="px-4 py-3 [scrollbar-width:thin]"
				contentDeps={[segments.length]}
			>
				{segments.length === 0 ? (
					<RecordingDetailRegionEmptySlot>
						<RecordingDetailEmptyState variant="noTranscript" compact />
					</RecordingDetailRegionEmptySlot>
				) : (
					<div ref={listRef} className="flex flex-col gap-3 pb-4">
						{segments.map((segment) => {
							const isActive = segment.id === activeSegmentId
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
											className={getTranscriptSegmentTimeClassName(isActive)}
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
												active={isActive}
												canEdit={capabilities.canEditSpeakers}
												onOpenSpeakerSettings={onOpenSpeakerSettings}
											/>
										) : null}
									</div>
									<p
										className={getTranscriptSegmentTextClassName(
											isActive,
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
	active,
	canEdit,
	onOpenSpeakerSettings,
}: {
	speakerId: string
	label: string
	active: boolean
	canEdit: boolean
	onOpenSpeakerSettings: () => void
}) {
	const chipStyle = resolveSpeakerChipStyle(speakerId)
	const chipClassName = cn(
		"inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] leading-4 text-foreground",
		chipStyle.chip,
		getTranscriptSpeakerChipToneClassName(active),
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
