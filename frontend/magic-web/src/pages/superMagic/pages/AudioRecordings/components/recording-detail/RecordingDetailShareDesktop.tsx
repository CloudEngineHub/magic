import { useCallback, useMemo, useState } from "react"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import { useRecordingAudioPlayer } from "../../hooks/useRecordingAudioPlayer"
import { useRecordingColorSegments } from "../../hooks/useRecordingColorSegments"
import { useRecordingPlayerCurrentSec } from "../../hooks/useRecordingPlayerCurrentSec"
import { useShareRecordingDetailData } from "../../hooks/useShareRecordingDetailData"
import type { RecordingTranscriptSegment } from "../../types/recording-detail"
import { buildShareRecordingCapabilities } from "../../utils/share-recording-detail"
import { collectExportableFileIds } from "../../utils/download-recording-batch"
import { downloadRecordingAudioFile } from "../../utils/download-recording-audio"
import { downloadRecordingAttachmentFile } from "../../utils/download-recording-attachment"
import { getAttachmentFileName } from "../../utils/recording-detail-files"
import { RecordingDetailProvider } from "./RecordingDetailProvider"
import { RecordingDetailHeader } from "./RecordingDetailHeader"
import { RecordingDetailWorkbench } from "./RecordingDetailWorkbench"
import { RecordingDetailLeftColumn } from "./RecordingDetailLeftColumn"
import { RecordingDetailRightPanel } from "./RecordingDetailRightPanel"
import { RecordingDetailEmptyState, RecordingDetailPageSkeleton } from "./RecordingDetailEmptyState"

interface RecordingDetailShareDesktopProps {
	projectId: string
	resourceName?: string
	allowDownloadProjectFile: boolean
	attachments: {
		tree: AttachmentItem[]
		list: AttachmentItem[]
	}
}

/** Renders the desktop read-only recording detail workbench from share attachments instead of owner project APIs. */
export function RecordingDetailShareDesktop({
	projectId,
	resourceName,
	allowDownloadProjectFile,
	attachments,
}: RecordingDetailShareDesktopProps) {
	const { loading, error, projectItem, fileMap, texts, audioUrl, title, attachmentList } =
		useShareRecordingDetailData({
			projectId,
			resourceName,
			attachments,
		})
	const capabilities = useMemo(
		() => buildShareRecordingCapabilities(allowDownloadProjectFile),
		[allowDownloadProjectFile],
	)
	const player = useRecordingAudioPlayer(audioUrl)
	const [playerExpanded, setPlayerExpanded] = useState(false)
	const playerCurrentSec = useRecordingPlayerCurrentSec(
		player.audioRef,
		player.playing,
		player.currentTime,
	)
	const summaryReady = Boolean(fileMap?.summaryFiles.length)
	const summaryContent = useMemo(
		() =>
			Object.fromEntries(
				Object.entries(texts.summary).map(([key, value]) => [key, value?.content]),
			),
		[texts.summary],
	)
	const speakerNameMap = fileMap?.magicProjectConfig?.metadata?.speakers ?? {}
	const colorSegments = useRecordingColorSegments(summaryReady, texts.summary.topics?.content)

	/** Sends summary time chips to the shared audio bar without enabling any owner mutations. */
	const handleSummaryTimeClick = useCallback(
		(seconds: number, end?: number) => {
			if (end != null) {
				player.playSegment({ start: seconds, end })
				return
			}
			player.seekTo(seconds, { autoplay: true })
		},
		[player],
	)

	/** Reuses transcript segment playback from the owner page while keeping the share shell read-only. */
	const handlePlaySegment = useCallback(
		(segment: RecordingTranscriptSegment) => {
			player.playSegment({ start: segment.start, end: segment.end })
		},
		[player],
	)

	/** Downloads the original audio file when the share permission allows export. */
	const handleDownloadAudio = useCallback(async () => {
		await downloadRecordingAudioFile({
			fileId: fileMap?.audio?.file_id,
			audioFile: fileMap?.audio,
			fallbackName: `${title || "recording"}_audio`,
		})
	}, [fileMap?.audio, title])

	/** Downloads the transcript markdown directly from the shared attachment file id. */
	const handleDownloadTranscript = useCallback(async () => {
		if (!fileMap?.transcript?.file_id) return
		await downloadRecordingAttachmentFile({
			fileId: fileMap.transcript.file_id,
			fileName:
				getAttachmentFileName(fileMap.transcript) ||
				`${title || "recording"}_transcript.md`,
		})
	}, [fileMap?.transcript, title])

	/** Downloads the notes markdown directly from the shared attachment file id. */
	const handleDownloadNotes = useCallback(async () => {
		if (!fileMap?.notes?.file_id) return
		await downloadRecordingAttachmentFile({
			fileId: fileMap.notes.file_id,
			fileName: getAttachmentFileName(fileMap.notes) || `${title || "recording"}_notes.md`,
		})
	}, [fileMap?.notes, title])

	/** Downloads one summary artifact at a time because share detail never exposes owner batch operations. */
	const handleDownloadSummaryType = useCallback(
		async (type: string) => {
			const fileRef = fileMap?.summaryFiles.find((item) => item.type === type)
			if (!fileRef?.file?.file_id) return
			await downloadRecordingAttachmentFile({
				fileId: fileRef.file.file_id,
				fileName:
					getAttachmentFileName(fileRef.file) || `${title || "recording"}_${type}.md`,
			})
		},
		[fileMap?.summaryFiles, title],
	)

	const exportAvailability = useMemo(
		() => ({
			hasAudio: Boolean(fileMap?.audio?.file_id),
			hasTranscript: Boolean(fileMap?.transcript?.file_id),
			hasNotes: Boolean(fileMap?.notes?.file_id),
			hasSummaryFiles: Boolean(fileMap?.summaryFiles.length),
			hasAnyExportable: collectExportableFileIds(fileMap).length > 0,
		}),
		[fileMap],
	)

	return (
		<RecordingDetailProvider capabilities={capabilities}>
			<div
				className="flex h-full min-h-0 flex-1 flex-col"
				data-testid="recording-detail-share-desktop"
			>
				<RecordingDetailHeader
					title={title || resourceName || "Recording"}
					projectItem={projectItem}
					fileMap={fileMap}
					exportAvailability={exportAvailability}
					canGenerateSummary={false}
					summarySubmitting={false}
					showBackButton={false}
					onBack={() => undefined}
					onRename={async () => false}
					onGenerateSummary={() => undefined}
					onExportAudio={() => void handleDownloadAudio()}
					onExportTranscript={() => void handleDownloadTranscript()}
					onExportNotes={() => void handleDownloadNotes()}
					onExportSummaryType={(type) => void handleDownloadSummaryType(type)}
					onExportAll={() => undefined}
					onCreateShare={() => undefined}
					onManageShare={() => undefined}
					onMoveGroup={() => undefined}
					onDelete={() => undefined}
				/>

				{loading ? <RecordingDetailPageSkeleton /> : null}

				{!loading && error ? (
					<RecordingDetailEmptyState
						variant="pageError"
						className="flex-1"
						onAction={() => undefined}
					/>
				) : null}

				{!loading && !error ? (
					<RecordingDetailWorkbench
						left={
							<RecordingDetailLeftColumn
								audioRef={player.audioRef}
								audioUrl={audioUrl}
								transcriptMarkdown={texts.transcript?.content}
								currentSec={playerCurrentSec}
								currentTime={player.currentTime}
								duration={player.duration}
								playing={player.playing}
								expanded={playerExpanded}
								playbackRate={player.playbackRate}
								colorSegments={colorSegments}
								speakerNameMap={speakerNameMap}
								onToggle={player.toggle}
								onSeek={player.seekTo}
								onPlaySegment={handlePlaySegment}
								onExpandedChange={setPlayerExpanded}
								onPlaybackRateChange={player.setPlaybackRate}
								onOpenSpeakerSettings={() => undefined}
							/>
						}
						right={
							<RecordingDetailRightPanel
								fileMap={fileMap}
								summaryContent={summaryContent}
								notesContent={texts.notes?.content}
								attachmentList={attachmentList}
								summaryReady={summaryReady}
								summarizing={false}
								summaryFailed={false}
								speakerNameMap={speakerNameMap}
								onOpenSpeakerSettings={() => undefined}
								onTimeClick={handleSummaryTimeClick}
							/>
						}
					/>
				) : null}
			</div>
		</RecordingDetailProvider>
	)
}
