import { useEffect, useMemo, useRef } from "react"
import { Settings2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import { cn } from "@/lib/utils"
import type { RecordingTranscriptSegment } from "../../types/recording-detail"
import { formatRecordingTime } from "../../utils/time"
import { ScrollEdgeFadeContainer } from "@/components/base-mobile/ScrollEdgeFade"
import { RecordingDetailEmptyState } from "./RecordingDetailEmptyState"
import { useRecordingDetailCapabilities } from "./RecordingDetailProvider"

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
					<Button
						variant="ghost"
						size="sm"
						onClick={onOpenSpeakerSettings}
						disabled={segments.length === 0}
						data-testid="recording-detail-open-speaker-settings"
					>
						<Settings2 className="mr-1 size-4" />
						{t("detail.openSpeakerSettings")}
					</Button>
				) : null}
			</div>

			<ScrollEdgeFadeContainer
				fadeColor="card"
				className="min-h-[320px] flex-1"
				scrollClassName="px-4 py-3 [scrollbar-width:thin]"
				contentDeps={[segments.length]}
			>
				{segments.length === 0 ? (
					<RecordingDetailEmptyState variant="noTranscript" compact />
				) : (
					<div ref={listRef} className="flex flex-col gap-3 pb-4">
						{segments.map((segment) => {
							const isActive = segment.id === activeSegmentId
							return (
								<button
									key={segment.id}
									type="button"
									data-segment-id={segment.id}
									className={cn(
										"rounded-xl px-3 py-2.5 text-left transition-opacity",
										isActive ? "bg-muted" : "opacity-70 hover:opacity-100",
									)}
									onClick={() => onSegmentClick(segment)}
									data-testid="recording-detail-transcript-segment"
								>
									<div className="mb-1 flex flex-wrap items-center gap-2">
										<span className="rounded-full bg-foreground px-2 py-0.5 text-[11px] font-medium text-background">
											{formatRecordingTime(segment.start)}
										</span>
										{segment.speaker ? (
											<span
												className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] text-foreground"
												onClick={(event) => {
													event.stopPropagation()
													onOpenSpeakerSettings()
												}}
											>
												{speakerNameMap[segment.speaker] ?? segment.speaker}
											</span>
										) : null}
									</div>
									<p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
										{segment.text}
									</p>
								</button>
							)
						})}
					</div>
				)}
			</ScrollEdgeFadeContainer>
		</div>
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
