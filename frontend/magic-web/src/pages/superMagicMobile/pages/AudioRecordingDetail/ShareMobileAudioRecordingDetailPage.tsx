import { useMemo, useState } from "react"
import { MoreHorizontal } from "lucide-react"
import { useTranslation } from "react-i18next"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import { useShareRecordingDetailData } from "@/pages/superMagic/pages/AudioRecordings/hooks/useShareRecordingDetailData"
import { useRecordingColorSegments } from "@/pages/superMagic/pages/AudioRecordings/hooks/useRecordingColorSegments"
import { useRecordingPlayerCurrentSec } from "@/pages/superMagic/pages/AudioRecordings/hooks/useRecordingPlayerCurrentSec"
import { downloadRecordingAudioFile } from "@/pages/superMagic/pages/AudioRecordings/utils/download-recording-audio"
import { MobileRecordingAudioPlayer } from "./components/MobileRecordingAudioPlayer"
import { MobileRecordingSourcePanel } from "./components/MobileRecordingSourcePanel"
import { MobileRecordingSummaryPanel } from "./components/MobileRecordingSummaryPanel"
import { MobileRecordingShareExportSheet } from "./components/MobileRecordingShareExportSheet"
import { useMobileRecordingAudioPlayer } from "./hooks/useMobileRecordingAudioPlayer"
import type { MobileRecordingTopTab } from "./types"

const COLLAPSED_PLAYER_HEIGHT = 40
const EXPANDED_PLAYER_HEIGHT = 182
const FLOATING_PLAYER_BOTTOM = 12

interface ShareMobileAudioRecordingDetailPageProps {
	projectId: string
	resourceName?: string
	allowDownloadProjectFile: boolean
	topbarOffset?: string
	attachments: {
		tree: AttachmentItem[]
		list: AttachmentItem[]
	}
}

/** Renders the H5 read-only recording detail experience inside the share route container. */
export default function ShareMobileAudioRecordingDetailPage({
	projectId,
	resourceName,
	allowDownloadProjectFile,
	topbarOffset,
	attachments,
}: ShareMobileAudioRecordingDetailPageProps) {
	const { t } = useTranslation("audioRecordings")
	const resolvedTopbarOffset = topbarOffset ?? "0px"
	const { loading, error, fileMap, texts, audioUrl, title, attachmentList } =
		useShareRecordingDetailData({
			projectId,
			resourceName,
			attachments,
		})
	const player = useMobileRecordingAudioPlayer(audioUrl)
	const playerCurrentSec = useRecordingPlayerCurrentSec(
		player.audioRef,
		player.playing,
		player.currentTime,
	)
	const [activeTab, setActiveTab] = useState<MobileRecordingTopTab>("summary")
	const [playerExpanded, setPlayerExpanded] = useState(false)
	const [shareExportSheetOpen, setShareExportSheetOpen] = useState(false)
	const summaryReady = Boolean(fileMap?.summaryFiles.length)
	const displayTitle = title || resourceName || t("detail.untitled")
	const summaryContent = useMemo(
		() =>
			Object.fromEntries(
				Object.entries(texts.summary).map(([key, value]) => [key, value?.content]),
			),
		[texts.summary],
	)
	const speakerNameMap = fileMap?.magicProjectConfig?.metadata?.speakers ?? {}
	const scrollPaddingBottom =
		FLOATING_PLAYER_BOTTOM +
		(playerExpanded ? EXPANDED_PLAYER_HEIGHT : COLLAPSED_PLAYER_HEIGHT) +
		20
	const colorSegments = useRecordingColorSegments(summaryReady, texts.summary.topics?.content)

	/** Sends mobile summary time chips to the shared player without leaving the current top-level tab. */
	function handleSummaryTimeClick(start: number, end?: number) {
		player.playSegment({ start, end })
	}

	/** Opens the export sheet only when the share permission still allows file downloads. */
	function openShareExportSheet() {
		if (!allowDownloadProjectFile) return
		setShareExportSheetOpen(true)
		setPlayerExpanded(false)
	}

	/** Downloads the original audio file from the readonly share bundle. */
	async function handleDownloadRecording() {
		await downloadRecordingAudioFile({
			fileId: fileMap?.audio?.file_id,
			audioFile: fileMap?.audio,
			fallbackName: `${title || "recording"}_audio`,
		})
	}

	if (loading) {
		return (
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
				{t("detail.loading")}
			</div>
		)
	}

	if (error) {
		return (
			<div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
				{t("detail.loadFailed")}
			</div>
		)
	}

	return (
		<div
			className="flex h-full min-h-0 flex-col bg-[#f7f7f8]"
			data-testid="mobile-recording-share-page"
			style={{ paddingTop: resolvedTopbarOffset }}
		>
			<ShareMobileRecordingHeader
				activeTab={activeTab}
				allowDownload={allowDownloadProjectFile}
				topbarOffset={resolvedTopbarOffset}
				onOpenMore={openShareExportSheet}
				onTabChange={setActiveTab}
			/>

			{/* Keep the title below the compact segmented header so the share container chrome never forces the tabs onto a second row. */}
			<div className="border-b border-border/60 bg-[#f7f7f8] px-4 pb-3 pt-2">
				<h1
					className="truncate text-[18px] font-semibold leading-6 text-foreground"
					style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
					title={displayTitle}
				>
					{displayTitle}
				</h1>
			</div>

			<div className="min-h-0 flex-1">
				{activeTab === "source" ? (
					<MobileRecordingSourcePanel
						transcriptContent={texts.transcript?.content}
						notesContent={texts.notes?.content}
						currentTime={playerCurrentSec}
						scrollPaddingBottom={scrollPaddingBottom}
						speakerNameMap={speakerNameMap}
						onOpenSpeakerSettings={() => undefined}
						onSeek={(seconds) => player.seekTo(seconds)}
					/>
				) : (
					<MobileRecordingSummaryPanel
						summaryFiles={fileMap?.summaryFiles ?? []}
						summaryContent={summaryContent}
						attachmentList={attachmentList}
						scrollPaddingBottom={scrollPaddingBottom}
						speakerNameMap={speakerNameMap}
						onOpenSpeakerSettings={() => undefined}
						onTimeClick={handleSummaryTimeClick}
					/>
				)}
			</div>

			<MobileRecordingAudioPlayer
				audioRef={player.audioRef}
				audioUrl={audioUrl}
				currentSec={playerCurrentSec}
				duration={player.duration}
				playing={player.playing}
				expanded={playerExpanded}
				playbackRate={player.playbackRate}
				colorSegments={colorSegments}
				onToggle={player.toggle}
				onSeek={player.seekTo}
				onExpandedChange={setPlayerExpanded}
				onPlaybackRateChange={player.setPlaybackRate}
			/>

			<MobileRecordingShareExportSheet
				open={shareExportSheetOpen}
				recordingName={displayTitle}
				fileMap={fileMap}
				projectId={projectId}
				allowDownload={allowDownloadProjectFile}
				showShareSection={false}
				mainHeaderTitle={t("card.moreActions")}
				onOpenChange={setShareExportSheetOpen}
				onShareLink={() => undefined}
				onDownloadRecording={() => void handleDownloadRecording()}
			/>
		</div>
	)
}

/** Aligns the readonly share header with the mobile detail prototype while keeping share actions disabled. */
function ShareMobileRecordingHeader({
	activeTab,
	allowDownload,
	topbarOffset,
	onOpenMore,
	onTabChange,
}: {
	activeTab: MobileRecordingTopTab
	allowDownload: boolean
	topbarOffset: string
	onOpenMore: () => void
	onTabChange: (tab: MobileRecordingTopTab) => void
}) {
	const { t } = useTranslation("audioRecordings")

	return (
		<header
			className="sticky z-20 bg-[#f7f7f8]"
			data-testid="mobile-recording-share-sticky-header"
			style={{ top: topbarOffset }}
		>
			<div className="relative flex items-center justify-end px-4 pt-1">
				{/* Center the segmented tabs independently from the trailing action so the layout stays balanced on narrow screens. */}
				<div className="pointer-events-none absolute inset-x-0 flex justify-center px-20">
					<div className="pointer-events-auto grid grid-cols-2 rounded-full bg-muted p-[3px]">
						<TopTabButton
							active={activeTab === "source"}
							label={t("detail.tabs.source")}
							onClick={() => onTabChange("source")}
						/>
						<TopTabButton
							active={activeTab === "summary"}
							label={t("detail.tabs.summaryRoot")}
							onClick={() => onTabChange("summary")}
						/>
					</div>
				</div>

				{allowDownload ? (
					<button
						type="button"
						className="inline-flex h-11 w-11 items-center justify-center text-foreground"
						onClick={onOpenMore}
						aria-label={t("card.moreActions")}
						data-testid="mobile-recording-share-more-button"
					>
						<MoreHorizontal className="size-5" strokeWidth={2} />
					</button>
				) : null}
			</div>
		</header>
	)
}

/** Reuses the compact top-level source/summary tab style while keeping the share page mutation-free. */
function TopTabButton({
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
			className={
				active
					? "inline-flex h-9 items-center rounded-full bg-background px-5 text-sm font-medium text-foreground shadow-[0_4px_12px_rgba(0,0,0,0.10)]"
					: "inline-flex h-9 items-center rounded-full px-5 text-sm font-medium text-muted-foreground"
			}
			onClick={onClick}
		>
			{label}
		</button>
	)
}
