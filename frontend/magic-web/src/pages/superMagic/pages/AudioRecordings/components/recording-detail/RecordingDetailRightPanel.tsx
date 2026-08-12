import { memo, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import type { RecordingDetailFileMap, RecordingDetailFileRef } from "../../types/recording-detail"
import { ScrollEdgeFadeContainer } from "@/components/base-mobile/ScrollEdgeFade"
import { RecordingDetailEmptyState } from "./RecordingDetailEmptyState"
import { RecordingDetailRegionEmptySlot } from "./RecordingDetailRegionEmptySlot"
import { RecordingDetailSummaryState } from "./RecordingDetailSummaryState"
import { RecordingDetailTabStrip } from "./RecordingDetailTabStrip"
import { RECORDING_DESKTOP_MD_CONTENT_CLASS } from "./recording-detail-layout"
import { RecordingMarkdownContent } from "./RecordingMarkdownContent"
import { RecordingSummaryContent } from "./RecordingSummaryContent"
import { resolveSummaryTypeLabel } from "./resolve-summary-type-label"

interface RecordingDetailRightPanelProps {
	fileMap: RecordingDetailFileMap | null
	summaryContent: Record<string, string | undefined>
	notesContent?: string
	attachmentList: AttachmentItem[]
	summaryReady: boolean
	summarizing: boolean
	summaryFailed: boolean
	speakerNameMap: Record<string, string>
	onOpenSpeakerSettings: () => void
	onTimeClick: (seconds: number, end?: number) => void
	onGenerateSummary?: () => void
	summarySubmitting?: boolean
}

/** Builds the dynamic right-panel tabs and renders summary/notes content or state placeholders. */
export const RecordingDetailRightPanel = memo(function RecordingDetailRightPanel({
	fileMap,
	summaryContent,
	notesContent,
	attachmentList,
	summaryReady,
	summarizing,
	summaryFailed,
	speakerNameMap,
	onOpenSpeakerSettings,
	onTimeClick,
	onGenerateSummary,
	summarySubmitting = false,
}: RecordingDetailRightPanelProps) {
	const { t } = useTranslation("audioRecordings")
	const tabs = useMemo(
		() => buildRightPanelTabs(fileMap, summaryContent, t),
		[fileMap, summaryContent, t],
	)
	const [activeKey, setActiveKey] = useState<string>(tabs[0]?.key ?? "notes")
	const prevSummaryReadyRef = useRef(summaryReady)

	// Reset to the first summary tab when summary content becomes ready after a pending/generating state.
	useEffect(() => {
		if (!prevSummaryReadyRef.current && summaryReady) {
			setActiveKey(tabs[0]?.key ?? "notes")
		}
		prevSummaryReadyRef.current = summaryReady
	}, [summaryReady, tabs])

	const resolvedActiveKey = tabs.some((tab) => tab.key === activeKey)
		? activeKey
		: (tabs[0]?.key ?? "notes")

	if (!summaryReady) {
		const status = summarizing ? "generating" : summaryFailed ? "failed" : "pending"
		return (
			<div
				className="flex h-full min-h-0 flex-col overflow-hidden rounded-[22px] border border-border bg-card shadow-sm"
				data-testid="recording-detail-right-panel"
			>
				<RecordingDetailSummaryState
					status={status}
					onGenerateSummary={onGenerateSummary}
					generating={summarySubmitting}
				/>
			</div>
		)
	}

	if (tabs.length === 0) {
		return (
			<div
				className="flex h-full min-h-0 items-center justify-center rounded-[22px] border border-border bg-card shadow-sm"
				data-testid="recording-detail-right-panel"
			>
				<RecordingDetailEmptyState variant="noSummary" />
			</div>
		)
	}

	const activeTab = tabs.find((tab) => tab.key === resolvedActiveKey) ?? tabs[0]

	return (
		<div
			// The panel must shrink with the workbench so focused transcript rows cannot scroll the horizontal viewport vertically.
			className="flex h-full min-h-0 flex-col overflow-hidden rounded-[22px] border border-border bg-card shadow-sm"
			data-testid="recording-detail-right-panel"
		>
			<RecordingDetailTabStrip
				tabs={tabs}
				activeKey={resolvedActiveKey}
				onChange={setActiveKey}
			/>

			{activeTab?.kind === "metrics" || activeTab?.file.type === "mindmap" ? (
				<div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-4">
					<RecordingSummaryContent
						file={activeTab.file}
						content={activeTab.content}
						attachmentList={attachmentList}
						speakerNameMap={speakerNameMap}
						onOpenSpeakerSettings={onOpenSpeakerSettings}
						onTimeClick={onTimeClick}
						layout="desktop"
					/>
				</div>
			) : (
				<ScrollEdgeFadeContainer
					fadeColor="card"
					className="min-h-0 flex-1"
					scrollClassName="py-4 [scrollbar-width:thin]"
					contentDeps={[
						resolvedActiveKey,
						activeTab?.kind,
						activeTab?.content,
						notesContent,
						tabs.length,
					]}
				>
					{activeTab?.kind === "notes" ? (
						notesContent?.trim() ? (
							<div className={RECORDING_DESKTOP_MD_CONTENT_CLASS}>
								<RecordingMarkdownContent
									content={notesContent}
									layout="desktop"
									speakerNameMap={speakerNameMap}
									onSpeakerClick={onOpenSpeakerSettings}
									onTimeClick={(time) => onTimeClick(time)}
								/>
							</div>
						) : (
							<RecordingDetailRegionEmptySlot>
								<RecordingDetailEmptyState variant="noNotes" compact />
							</RecordingDetailRegionEmptySlot>
						)
					) : activeTab ? (
						<RecordingSummaryContent
							file={activeTab.file}
							content={activeTab.content}
							attachmentList={attachmentList}
							speakerNameMap={speakerNameMap}
							onOpenSpeakerSettings={onOpenSpeakerSettings}
							onTimeClick={onTimeClick}
							layout="desktop"
						/>
					) : null}
				</ScrollEdgeFadeContainer>
			)}
		</div>
	)
})

interface RightPanelTab {
	key: string
	label: string
	kind: "summary" | "notes" | "metrics"
	file: RecordingDetailFileRef
	content?: string
	badgeCount?: number
}

/** Assembles summary tabs from fileMap and always appends the notes tab. */
function buildRightPanelTabs(
	fileMap: RecordingDetailFileMap | null,
	summaryContent: Record<string, string | undefined>,
	t: ReturnType<typeof useTranslation>["t"],
): RightPanelTab[] {
	const summaryTabs =
		fileMap?.summaryFiles.map((file) => ({
			key: file.type,
			label: resolveSummaryTypeLabel(file.type),
			kind: file.type === "metrics" ? ("metrics" as const) : ("summary" as const),
			file,
			content: summaryContent[file.type],
		})) ?? []

	const notesTab: RightPanelTab = {
		key: "notes",
		label: t("detail.tabs.notes"),
		kind: "notes",
		file: {
			type: "notes",
			fileName: "notes",
			file: fileMap?.notes ?? ({} as AttachmentItem),
		},
		content: undefined,
	}

	return [...summaryTabs, notesTab]
}
