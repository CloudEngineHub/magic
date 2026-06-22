import type { ReactNode } from "react"
import { useEffect, useMemo, useState } from "react"
import { AlignLeft, Network } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import MagicMarkmap from "@/components/base/MagicMarkmap"
import IsolatedHTMLRenderer from "@/pages/superMagic/components/Detail/contents/HTML/IsolatedHTMLRenderer"
import { processHtmlContent } from "@/pages/superMagic/components/Detail/contents/HTML/htmlProcessor"
import type { RecordingDetailFileRef, RecordingTopicSection } from "../../types/recording-detail"
import { parseTopicsMarkdown } from "../../utils/topics-parser"
import { formatRecordingTime } from "../../utils/time"
import { RecordingMarkdownContent } from "./RecordingMarkdownContent"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"

export interface RecordingSummaryContentProps {
	file: RecordingDetailFileRef
	content?: string
	attachmentList: AttachmentItem[]
	emptyText: string
	speakerNameMap: Record<string, string>
	onOpenSpeakerSettings: () => void
	onTimeClick: (seconds: number, end?: number) => void
	scrollPaddingBottom?: number
	layout?: "desktop" | "mobile"
}

/** Selects the renderer for each supported completed-summary file type. */
export function RecordingSummaryContent({
	file,
	content,
	attachmentList,
	emptyText,
	speakerNameMap,
	onOpenSpeakerSettings,
	onTimeClick,
	scrollPaddingBottom = 0,
	layout = "desktop",
}: RecordingSummaryContentProps) {
	if (!content?.trim()) {
		return <PanelMessage>{emptyText}</PanelMessage>
	}

	if (file.type === "metrics") {
		return <MetricsHtmlContent file={file} content={content} attachmentList={attachmentList} />
	}

	if (file.type === "topics") {
		return (
			<TopicsContent
				topics={parseTopicsMarkdown(content)}
				speakerNameMap={speakerNameMap}
				onOpenSpeakerSettings={onOpenSpeakerSettings}
				onTimeClick={onTimeClick}
				emptyText={emptyText}
			/>
		)
	}

	if (file.type === "mindmap") {
		return (
			<MindmapContent
				content={content}
				scrollPaddingBottom={scrollPaddingBottom}
				speakerNameMap={speakerNameMap}
				onOpenSpeakerSettings={onOpenSpeakerSettings}
				onTimeClick={onTimeClick}
				layout={layout}
			/>
		)
	}

	return (
		<div className="pb-8">
			<RecordingMarkdownContent
				content={content}
				speakerNameMap={speakerNameMap}
				onSpeakerClick={onOpenSpeakerSettings}
				onTimeClick={(time) => onTimeClick(time)}
			/>
		</div>
	)
}

function MetricsHtmlContent({
	file,
	content,
	attachmentList,
}: {
	file: RecordingDetailFileRef
	content: string
	attachmentList: AttachmentItem[]
}) {
	const [processedContent, setProcessedContent] = useState(content)
	const [filePathMapping, setFilePathMapping] = useState<Map<string, string>>(new Map())

	useEffect(() => {
		let cancelled = false

		void processHtmlContent({
			content,
			attachments: attachmentList,
			attachmentList,
			fileId: file.file.file_id,
			fileName: file.fileName,
		}).then((result) => {
			if (cancelled) return
			setProcessedContent(result.processedContent)
			setFilePathMapping(result.filePathMapping)
		})

		return () => {
			cancelled = true
		}
	}, [attachmentList, content, file.file.file_id, file.fileName])

	return (
		<div
			className="flex min-h-0 flex-1 flex-col"
			data-testid="recording-detail-metrics-container"
		>
			<IsolatedHTMLRenderer
				content={processedContent}
				fileId={file.file.file_id}
				filePathMapping={filePathMapping}
				attachmentList={attachmentList}
				relative_file_path={file.file.relative_file_path}
				openNewTab={() => undefined}
				className="flex min-h-[520px] flex-1 overflow-hidden rounded-2xl bg-card"
				iframeClassName="h-full min-h-[520px] bg-white"
			/>
		</div>
	)
}

function MindmapContent({
	content,
	scrollPaddingBottom,
	speakerNameMap,
	onOpenSpeakerSettings,
	onTimeClick,
	layout,
}: {
	content: string
	scrollPaddingBottom: number
	speakerNameMap: Record<string, string>
	onOpenSpeakerSettings: () => void
	onTimeClick: (seconds: number, end?: number) => void
	layout: "desktop" | "mobile"
}) {
	const [viewMode, setViewMode] = useState<"map" | "markdown">("map")
	const isDesktop = layout === "desktop"
	const canvasClassName = isDesktop
		? "!h-full min-h-0 bg-muted [&_svg]:bg-muted [&_svg]:[background-image:none]"
		: "h-full min-h-[480px] bg-muted [&_svg]:bg-muted [&_svg]:[background-image:none]"

	if (isDesktop) {
		return (
			<div className="relative h-full min-h-0" data-testid="recording-detail-mindmap">
				{viewMode === "map" ? (
					<div className="absolute inset-0 overflow-hidden rounded-xl bg-muted">
						<MagicMarkmap
							data={content}
							fullScreen
							showTitle={false}
							showToolBar={false}
							className={canvasClassName}
						/>
					</div>
				) : (
					<div className="absolute inset-0 overflow-y-auto px-1 pb-8 pt-1">
						<RecordingMarkdownContent
							content={content}
							speakerNameMap={speakerNameMap}
							onSpeakerClick={onOpenSpeakerSettings}
							onTimeClick={(time) => onTimeClick(time)}
						/>
					</div>
				)}
				<MindmapViewSwitch value={viewMode} onChange={setViewMode} layout={layout} />
			</div>
		)
	}

	return (
		<div className="relative min-h-[480px]" data-testid="recording-detail-mindmap">
			{viewMode === "map" ? (
				<div className="relative h-[min(560px,calc(100vh-280px))] min-h-[480px] overflow-hidden rounded-xl bg-muted">
					<MagicMarkmap
						data={content}
						fullScreen
						showTitle={false}
						showToolBar={false}
						className={canvasClassName}
					/>
					<MindmapViewSwitch
						value={viewMode}
						bottom={scrollPaddingBottom}
						onChange={setViewMode}
						layout={layout}
					/>
				</div>
			) : (
				<div className="relative px-1 pb-8 pt-1">
					<RecordingMarkdownContent
						content={content}
						speakerNameMap={speakerNameMap}
						onSpeakerClick={onOpenSpeakerSettings}
						onTimeClick={(time) => onTimeClick(time)}
					/>
					<MindmapViewSwitch
						value={viewMode}
						bottom={scrollPaddingBottom}
						onChange={setViewMode}
						layout={layout}
					/>
				</div>
			)}
		</div>
	)
}

function MindmapViewSwitch({
	value,
	bottom = 0,
	onChange,
	layout,
}: {
	value: "map" | "markdown"
	bottom?: number
	onChange: (value: "map" | "markdown") => void
	layout: "desktop" | "mobile"
}) {
	const { t } = useTranslation("audioRecordings")
	const positionClass =
		layout === "mobile" ? "fixed right-4 z-20" : "absolute bottom-4 left-4 z-20"

	return (
		<div
			className={cn(
				positionClass,
				"inline-flex rounded-2xl bg-card p-1 shadow-[0_8px_24px_rgba(0,0,0,0.14)]",
			)}
			style={layout === "mobile" ? { bottom } : undefined}
		>
			<button
				type="button"
				className={cn(
					"flex size-9 items-center justify-center rounded-xl",
					value === "map" ? "bg-foreground text-background" : "text-foreground",
				)}
				aria-label={t("detail.showMindmap")}
				onClick={() => onChange("map")}
			>
				<Network className="size-4" />
			</button>
			<button
				type="button"
				className={cn(
					"flex size-9 items-center justify-center rounded-xl",
					value === "markdown" ? "bg-foreground text-background" : "text-foreground",
				)}
				aria-label={t("detail.showMarkdown")}
				onClick={() => onChange("markdown")}
			>
				<AlignLeft className="size-4" />
			</button>
		</div>
	)
}

function TopicsContent({
	topics,
	speakerNameMap,
	onOpenSpeakerSettings,
	onTimeClick,
	emptyText,
}: {
	topics: RecordingTopicSection[]
	speakerNameMap: Record<string, string>
	onOpenSpeakerSettings: () => void
	onTimeClick: (seconds: number, end?: number) => void
	emptyText: string
}) {
	const { t } = useTranslation("audioRecordings")
	const [activeTopicId, setActiveTopicId] = useState(topics[0]?.id ?? "")
	const activeTopic = useMemo(
		() => topics.find((topic) => topic.id === activeTopicId) ?? topics[0],
		[activeTopicId, topics],
	)

	if (topics.length === 0 || !activeTopic) {
		return <PanelMessage>{emptyText}</PanelMessage>
	}

	return (
		<div className="flex flex-col gap-4" data-testid="recording-detail-topics-content">
			<div className="-mx-1 overflow-x-auto">
				<div className="flex w-max gap-2">
					{topics.map((topic) => (
						<button
							key={topic.id}
							type="button"
							className={cn(
								"h-8 rounded-full border px-4 text-[14px] font-medium leading-none transition-colors",
								topic.id === activeTopic.id
									? "border-foreground bg-foreground text-background"
									: "border-border bg-card/70 text-muted-foreground",
							)}
							onClick={() => setActiveTopicId(topic.id)}
						>
							{topic.name}
						</button>
					))}
				</div>
			</div>

			<div>
				{activeTopic.summaryText ? (
					<section>
						<h3 className="mb-3 text-[16px] font-semibold leading-6 text-foreground">
							{activeTopic.summaryTitle || t("detail.topicSummary")}
						</h3>
						{activeTopic.summarySpeakers.length > 0 ? (
							<div className="mb-3 flex flex-wrap gap-1.5">
								{activeTopic.summarySpeakers.map((speaker) => (
									<button
										type="button"
										key={speaker}
										className="rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground hover:opacity-80"
										onClick={onOpenSpeakerSettings}
									>
										{speakerNameMap[speaker] ?? speaker}
									</button>
								))}
							</div>
						) : null}
						<RecordingMarkdownContent
							content={activeTopic.summaryText}
							speakerNameMap={speakerNameMap}
							onSpeakerClick={onOpenSpeakerSettings}
							onTimeClick={(time) => onTimeClick(time)}
						/>
					</section>
				) : null}

				{activeTopic.items.length > 0 ? (
					<section className="mt-6">
						<h3 className="mb-3 text-[16px] font-semibold leading-6 text-foreground">
							{activeTopic.itemsTitle || t("detail.relatedDialogue")}
						</h3>
						<div className="flex flex-col gap-2">
							{activeTopic.items.map((item) => (
								<button
									key={`${item.time}-${item.text}`}
									type="button"
									className="rounded-xl bg-card/80 px-3 py-2.5 text-left shadow-[0_4px_16px_rgba(0,0,0,0.03)] hover:bg-muted"
									onClick={() => onTimeClick(item.time, item.timeEnd)}
									data-testid="recording-detail-topic-time-card"
								>
									<div className="mb-1 flex flex-wrap items-center gap-1.5">
										<span className="rounded-full bg-foreground px-2 py-0.5 text-[11px] font-medium text-background">
											{formatRecordingTime(item.time)}
											{item.timeEnd
												? `-${formatRecordingTime(item.timeEnd)}`
												: ""}
										</span>
										{item.speakers.map((speaker) => (
											<span
												key={speaker}
												className="rounded-full px-2 py-0.5 text-[11px] text-muted-foreground"
											>
												{speakerNameMap[speaker] ?? speaker}
											</span>
										))}
									</div>
									<p className="text-[13px] leading-5 text-foreground">
										{item.text}
									</p>
								</button>
							))}
						</div>
					</section>
				) : null}
			</div>
		</div>
	)
}

function PanelMessage({ children }: { children: ReactNode }) {
	return (
		<div className="rounded-2xl bg-muted/50 px-6 py-16 text-center text-sm text-muted-foreground">
			{children}
		</div>
	)
}
