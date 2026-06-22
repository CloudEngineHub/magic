import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { ScrollEdgeFadeContainer } from "@/components/base-mobile/ScrollEdgeFade"
import { cn } from "@/lib/utils"
import type { MobileRecordingSourceTab, RecordingTranscriptSegment } from "../types"
import { parseTranscriptMarkdown } from "../utils/transcript-parser"
import { formatRecordingTime } from "../utils/time"
import { MobileRecordingMarkdownContent } from "./MobileRecordingMarkdownContent"

interface MobileRecordingSourcePanelProps {
	transcriptContent?: string
	notesContent?: string
	currentTime: number
	scrollPaddingBottom: number
	speakerNameMap: Record<string, string>
	onOpenSpeakerSettings: () => void
	onSeek: (seconds: number) => void
	onContentScroll?: () => void
}

/** Shows completed source attachments: transcript timeline and readonly notes markdown. */
export function MobileRecordingSourcePanel({
	transcriptContent,
	notesContent,
	currentTime,
	scrollPaddingBottom,
	speakerNameMap,
	onOpenSpeakerSettings,
	onSeek,
	onContentScroll,
}: MobileRecordingSourcePanelProps) {
	const { t } = useTranslation("audioRecordings")
	const [activeTab, setActiveTab] = useState<MobileRecordingSourceTab>("transcript")
	const segments = useMemo(
		() => parseTranscriptMarkdown(transcriptContent ?? ""),
		[transcriptContent],
	)

	return (
		<div className="flex min-h-0 flex-1 flex-col" data-testid="mobile-recording-source-panel">
			<div className="sticky top-0 z-10 flex bg-[#f7f7f8] px-4 py-3">
				<SourceTabButton
					active={activeTab === "transcript"}
					label={t("detail.tabs.transcript")}
					onClick={() => setActiveTab("transcript")}
				/>
				<SourceTabButton
					active={activeTab === "notes"}
					label={t("detail.tabs.notes")}
					onClick={() => setActiveTab("notes")}
				/>
			</div>

			{/* 来源正文统一收敛为唯一滚动口，避免外层 main 与内层内容区同时滚动导致阴影错位。 */}
			<ScrollEdgeFadeContainer
				fadeColor="mobile-background"
				className="min-h-0 flex-1"
				scrollClassName="px-4"
				contentDeps={[activeTab, segments.length, Boolean(notesContent?.trim())]}
				onScroll={onContentScroll}
			>
				<div className="min-h-full" style={{ paddingBottom: scrollPaddingBottom }}>
					{activeTab === "transcript" ? (
						<TranscriptList
							segments={segments}
							currentTime={currentTime}
							speakerNameMap={speakerNameMap}
							emptyText={t("detail.emptyTranscript")}
							onOpenSpeakerSettings={onOpenSpeakerSettings}
							onSeek={onSeek}
						/>
					) : (
						<div className="pb-8">
							{notesContent?.trim() ? (
								<MobileRecordingMarkdownContent
									content={notesContent}
									speakerNameMap={speakerNameMap}
									onSpeakerClick={onOpenSpeakerSettings}
									onTimeClick={onSeek}
								/>
							) : (
								<p className="py-10 text-center text-sm text-muted-foreground">
									{t("detail.emptyNotes")}
								</p>
							)}
						</div>
					)}
				</div>
			</ScrollEdgeFadeContainer>
		</div>
	)
}

/** Segmented source tab button that mirrors the prototype's compact second-level tabs. */
function SourceTabButton({
	active,
	label,
	onClick,
}: {
	active: boolean
	label: string
	onClick: () => void
}) {
	return (
		<button
			type="button"
			className={cn(
				"inline-flex h-8 shrink-0 items-center rounded-full px-5 text-[14px] font-medium leading-none transition-colors",
				active
					? "bg-foreground text-background shadow-[0_4px_12px_rgba(0,0,0,0.15)]"
					: "text-muted-foreground",
			)}
			onClick={onClick}
		>
			{label}
		</button>
	)
}

/** Renders transcript segments and highlights the row matching the current playback time. */
function TranscriptList({
	segments,
	currentTime,
	speakerNameMap,
	emptyText,
	onOpenSpeakerSettings,
	onSeek,
}: {
	segments: RecordingTranscriptSegment[]
	currentTime: number
	speakerNameMap: Record<string, string>
	emptyText: string
	onOpenSpeakerSettings: () => void
	onSeek: (seconds: number) => void
}) {
	const { t } = useTranslation("audioRecordings")

	if (segments.length === 0) {
		return <p className="py-12 text-center text-sm text-muted-foreground">{emptyText}</p>
	}

	return (
		<div className="flex flex-col gap-7">
			{segments.map((segment) => {
				const active =
					currentTime >= segment.start &&
					(segment.end == null || currentTime < segment.end)
				// Use a keyboard-accessible div instead of a button so the nested speaker action
				// can remain interactive without triggering invalid button-in-button DOM.
				const handleSeek = () => onSeek(segment.start)

				return (
					<div
						key={segment.id}
						role="button"
						tabIndex={0}
						className={cn(
							"rounded-xl text-left transition-colors active:bg-muted/60",
							active && "bg-card/80 px-3 py-2 shadow-[0_4px_16px_rgba(0,0,0,0.04)]",
						)}
						onClick={handleSeek}
						onKeyDown={(event) => {
							if (event.key === "Enter" || event.key === " ") {
								event.preventDefault()
								handleSeek()
							}
						}}
						data-testid="mobile-recording-transcript-item"
					>
						<div className="mb-2 flex items-center gap-2 text-[12px] font-medium">
							<span className="shrink-0 tabular-nums text-foreground">
								{formatRecordingTime(segment.start)}
							</span>
							{segment.speaker ? (
								<button
									type="button"
									className="inline-flex items-center rounded-full border border-blue-200 bg-blue-100 px-2 py-0.5 text-[12px] leading-4 text-foreground active:opacity-70"
									onClick={(event) => {
										event.stopPropagation()
										onOpenSpeakerSettings()
									}}
									aria-label={t("detail.openSpeakerSettings")}
								>
									<span className="mr-1 size-1.5 rounded-full bg-blue-500" />
									{speakerNameMap[segment.speaker] ?? segment.speaker}
								</button>
							) : null}
						</div>
						<p className="text-[16px] leading-7 text-foreground">{segment.text}</p>
					</div>
				)
			})}
		</div>
	)
}
