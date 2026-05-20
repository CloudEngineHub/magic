import { useCallback, useState } from "react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import superMagicService from "@/pages/superMagic/services"
import type { SelfMediaInitData } from "./types"
import { ALL_PLATFORMS, STYLE_PRESETS, collectArticleMaterials } from "./types"
import {
	navigateToBatchTopic,
	sendArticleBatch,
	type ArticleBatchTopicItem,
} from "../../services/selfMediaBatchSend"

interface StepConfirmProps {
	data: SelfMediaInitData
	selectedProject?: { id: string } | null
	folderFileId?: string
	folderPath?: string
	onSaveTemplate?: (name: string) => Promise<void>
	onArchiveDraft?: () => Promise<void>
	onGenerateFailed?: () => void
}

function TopicProgressList({
	topics,
	activeTopicId,
	totalCount,
	isGenerating,
	onSelectTopic,
	t,
}: {
	topics: ArticleBatchTopicItem[]
	activeTopicId: string | null
	totalCount: number
	isGenerating: boolean
	onSelectTopic: (item: ArticleBatchTopicItem) => void
	t: (key: string, opts?: Record<string, unknown>) => string
}) {
	return (
		<div className="flex flex-col gap-2">
			<p className="text-xs text-muted-foreground">
				{t("detail.selfMedia.initPanel.stepConfirm.topicListHint")}
			</p>
			<ul className="flex flex-col gap-2">
				{topics.map((item) => {
					const isActive = activeTopicId === item.topicId
					return (
						<li key={item.topicId}>
							<button
								type="button"
								className={cn(
									"flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all",
									isActive
										? "border-primary bg-primary/5 shadow-sm"
										: "border-border/50 bg-background hover:border-primary/30 hover:bg-muted/30",
								)}
								onClick={() => onSelectTopic(item)}
							>
								<span
									className={cn(
										"flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
										isActive
											? "bg-primary text-primary-foreground"
											: "bg-muted text-muted-foreground",
									)}
								>
									{item.articleIndex + 1}
								</span>
								<div className="min-w-0 flex-1">
									<p className="truncate text-sm font-medium">
										{item.articleTitle}
									</p>
									<p className="truncate text-xs text-muted-foreground">
										{item.topicName}
									</p>
								</div>
								{isActive && (
									<span className="shrink-0 text-xs font-medium text-primary">
										{t("detail.selfMedia.initPanel.stepConfirm.viewing")}
									</span>
								)}
							</button>
						</li>
					)
				})}
				{isGenerating &&
					Array.from({ length: Math.max(0, totalCount - topics.length) }).map((_, i) => (
						<li
							key={`pending-${i}`}
							className="flex items-center gap-3 rounded-xl border border-dashed border-border/50 px-4 py-3 opacity-60"
						>
							<span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground">
								{topics.length + i + 1}
							</span>
							<span className="text-sm text-muted-foreground">
								{t("detail.selfMedia.initPanel.stepConfirm.creatingTopic")}
							</span>
							<svg
								className="ml-auto animate-spin text-muted-foreground"
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
							>
								<path d="M21 12a9 9 0 1 1-6.219-8.56" />
							</svg>
						</li>
					))}
			</ul>
		</div>
	)
}

export default function StepConfirm({
	data,
	selectedProject,
	folderFileId,
	folderPath,
	onSaveTemplate,
	onArchiveDraft,
	onGenerateFailed,
}: StepConfirmProps) {
	const [sending, setSending] = useState(false)
	const [sent, setSent] = useState(false)
	const [batchTopics, setBatchTopics] = useState<ArticleBatchTopicItem[]>([])
	const [activeTopicId, setActiveTopicId] = useState<string | null>(null)
	const [showTemplateNameInput, setShowTemplateNameInput] = useState(false)
	const [templateName, setTemplateName] = useState("")
	const [templateSaved, setTemplateSaved] = useState(false)
	const { t } = useTranslation("super")

	const projectId = selectedProject?.id || ""

	const getStyleLabel = (value: string): string => {
		const preset = STYLE_PRESETS.find((p) => p.value === value)
		return preset ? t(preset.labelKey) : value
	}

	const getPlatformLabel = (value: string): string => {
		const platform = ALL_PLATFORMS.find((p) => p.value === value)
		return platform ? t(platform.labelKey) : value
	}

	const handleSwitchTopic = useCallback(
		(item: ArticleBatchTopicItem) => {
			if (!projectId) return
			setActiveTopicId(item.topicId)
			navigateToBatchTopic(projectId, item.topic)
		},
		[projectId],
	)

	const handleGenerate = async () => {
		if (sending || sent || !projectId) return
		setSending(true)
		setBatchTopics([])
		setActiveTopicId(null)

		let isFirstTopic = true

		try {
			await onArchiveDraft?.()
			const created = await sendArticleBatch({
				articles: data.articles,
				globalSettings: data.global,
				selectedProject,
				selfMediaProjectDirectory: folderPath
					? {
							directoryId: folderFileId,
							directoryPath: folderPath,
							directoryName: folderPath.split("/").filter(Boolean).pop(),
						}
					: undefined,
				onTopicCreated: (item) => {
					setBatchTopics((prev) => [...prev, item])
					if (isFirstTopic) {
						isFirstTopic = false
						setActiveTopicId(item.topicId)
						navigateToBatchTopic(projectId, item.topic)
					}
				},
			})

			if (created.length > 0) {
				await superMagicService.topic.fetchTopics({
					projectId,
					isAutoSelect: false,
				})
			}

			setSent(true)
		} catch (error) {
			onGenerateFailed?.()
			console.error("Failed to send batch:", error)
		} finally {
			setSending(false)
		}
	}

	const handleSaveTemplate = async () => {
		if (!templateName.trim() || !onSaveTemplate) return
		try {
			await onSaveTemplate(templateName.trim())
			setTemplateSaved(true)
			setShowTemplateNameInput(false)
		} catch {
			// silent
		}
	}

	const showTopicProgress = sending || sent

	if (sent || (sending && batchTopics.length > 0)) {
		return (
			<div className="mx-auto flex max-w-lg flex-col py-8">
				<div className="mb-6 text-center">
					<div className="relative mx-auto mb-4 flex h-16 w-16 items-center justify-center">
						{sending && (
							<div className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
						)}
						<div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5">
							{sending ? (
								<svg
									className="animate-spin text-primary"
									width="28"
									height="28"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
								>
									<path d="M21 12a9 9 0 1 1-6.219-8.56" />
								</svg>
							) : (
								<svg
									width="28"
									height="28"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="1.5"
									className="text-primary"
								>
									<path
										d="M12 2v4M16.2 7.8l2.9-2.9M18 12h4M16.2 16.2l2.9 2.9M12 18v4M4.9 19.1l2.9-2.9M2 12h4M4.9 4.9l2.9 2.9"
										strokeLinecap="round"
										strokeLinejoin="round"
									/>
								</svg>
							)}
						</div>
					</div>
					<h3 className="mb-1 text-xl font-bold">
						{sending
							? t("detail.selfMedia.initPanel.stepConfirm.generatingTitle")
							: t("detail.selfMedia.initPanel.stepConfirm.doneTitle")}
					</h3>
					<p className="text-sm text-muted-foreground">
						{sending
							? t("detail.selfMedia.initPanel.stepConfirm.generatingDesc", {
									done: batchTopics.length,
									total: data.articles.length,
								})
							: t("detail.selfMedia.initPanel.stepConfirm.doneDesc", {
									count: data.articles.length,
								})}
					</p>
				</div>

				<TopicProgressList
					topics={batchTopics}
					activeTopicId={activeTopicId}
					totalCount={data.articles.length}
					isGenerating={sending}
					onSelectTopic={handleSwitchTopic}
					t={t}
				/>
			</div>
		)
	}

	return (
		<div className="mx-auto max-w-xl">
			<div className="mb-6 text-center">
				<h2 className="mb-2 text-xl font-bold tracking-tight">
					{t("detail.selfMedia.initPanel.stepConfirm.title")}
				</h2>
				<p className="text-sm text-muted-foreground">
					{t("detail.selfMedia.initPanel.stepConfirm.subtitle")}
				</p>
			</div>

			<div className="mb-5 rounded-xl border border-border/50 bg-gradient-to-br from-muted/30 to-background p-5 shadow-sm">
				<div className="mb-3 flex items-center gap-2">
					<div className="flex h-5 w-5 items-center justify-center rounded bg-primary/10">
						<svg
							width="12"
							height="12"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							className="text-primary"
						>
							<circle cx="12" cy="12" r="10" />
							<path d="M12 6v6l4 2" />
						</svg>
					</div>
					<h3 className="text-sm font-semibold">
						{t("detail.selfMedia.initPanel.stepConfirm.globalSummary")}
					</h3>
				</div>
				<div className="grid grid-cols-1 gap-2.5 text-sm sm:grid-cols-2">
					<div className="flex items-center gap-2 rounded-lg bg-background/60 px-3 py-2">
						<span className="text-muted-foreground text-xs">
							{t("detail.selfMedia.initPanel.stepConfirm.accountLabel")}
						</span>
						<span className="font-medium">{data.global.author}</span>
					</div>
					<div className="col-span-full flex items-center gap-2 rounded-lg bg-background/60 px-3 py-2">
						<span className="text-muted-foreground text-xs">
							{t("detail.selfMedia.initPanel.stepConfirm.positionLabel")}
						</span>
						<span className="font-medium">{data.global.brandPosition}</span>
					</div>
					{data.global.targetAudience && (
						<div className="col-span-full flex items-center gap-2 rounded-lg bg-background/60 px-3 py-2">
							<span className="text-muted-foreground text-xs">
								{t("detail.selfMedia.initPanel.stepConfirm.audienceLabel")}
							</span>
							<span className="font-medium">{data.global.targetAudience}</span>
						</div>
					)}
				</div>
			</div>

			<div className="flex flex-col gap-3">
				{data.articles.map((article, index) => (
					<div
						key={index}
						className="rounded-xl border border-border/50 bg-background p-4 shadow-sm transition-all hover:shadow-md"
					>
						<div className="flex items-center gap-2.5">
							<span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5 text-xs font-bold text-primary">
								{index + 1}
							</span>
							<h4 className="text-sm font-semibold flex-1">{article.title}</h4>
						</div>
						<div className="mt-2.5 ml-8 flex flex-wrap gap-1.5">
							{article.platform && (
								<span className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200/50 dark:border-blue-800/50 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">
									{getPlatformLabel(article.platform)}
								</span>
							)}
							{article.style && (
								<span className="rounded-md bg-primary/5 border border-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
									{getStyleLabel(article.style)}
								</span>
							)}
							{article.outline.length > 0 && (
								<span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
									{t("detail.selfMedia.initPanel.stepConfirm.outlinePoints", {
										count: article.outline.length,
									})}
								</span>
							)}
							{article.cardCount > 0 && (
								<span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
									{t("detail.selfMedia.initPanel.stepConfirm.cardCount", {
										count: article.cardCount,
									})}
								</span>
							)}
							{collectArticleMaterials(article).length > 0 && (
								<span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
									{t("detail.selfMedia.initPanel.stepConfirm.refCount", {
										count: collectArticleMaterials(article).length,
									})}
								</span>
							)}
						</div>
					</div>
				))}
			</div>

			{showTopicProgress && batchTopics.length > 0 && (
				<div className="mt-6">
					<TopicProgressList
						topics={batchTopics}
						activeTopicId={activeTopicId}
						totalCount={data.articles.length}
						isGenerating={sending}
						onSelectTopic={handleSwitchTopic}
						t={t}
					/>
				</div>
			)}

			{onSaveTemplate && !templateSaved && (
				<div className="mt-6">
					{showTemplateNameInput ? (
						<div className="flex items-center gap-2 rounded-xl border border-border/50 bg-muted/30 p-3">
							<input
								type="text"
								className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
								placeholder={t(
									"detail.selfMedia.initPanel.stepConfirm.templateNamePlaceholder",
								)}
								value={templateName}
								onChange={(e) => setTemplateName(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") handleSaveTemplate()
								}}
								autoFocus
							/>
							<button
								type="button"
								className="rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
								onClick={handleSaveTemplate}
								disabled={!templateName.trim()}
							>
								{t("detail.selfMedia.initPanel.stepConfirm.saveTemplate")}
							</button>
							<button
								type="button"
								className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
								onClick={() => setShowTemplateNameInput(false)}
							>
								{t("detail.selfMedia.initPanel.stepConfirm.cancel")}
							</button>
						</div>
					) : (
						<button
							type="button"
							className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-3 text-xs font-medium text-muted-foreground transition-all hover:border-primary/30 hover:text-foreground"
							onClick={() => setShowTemplateNameInput(true)}
						>
							<svg
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
								<polyline points="17 21 17 13 7 13 7 21" />
								<polyline points="7 3 7 8 15 8" />
							</svg>
							{t("detail.selfMedia.initPanel.stepConfirm.saveAsTemplate")}
						</button>
					)}
				</div>
			)}
			{templateSaved && (
				<div className="mt-6 flex items-center justify-center gap-2 rounded-xl bg-green-50 dark:bg-green-950/20 py-3 text-xs font-medium text-green-600 dark:text-green-400">
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<polyline points="20 6 9 17 4 12" />
					</svg>
					{t("detail.selfMedia.initPanel.stepConfirm.templateSaved")}
				</div>
			)}

			<button
				type="button"
				className={cn(
					"mt-4 flex w-full items-center justify-center gap-2.5 rounded-xl py-4 text-sm font-semibold transition-all duration-200",
					sending
						? "cursor-not-allowed bg-muted text-muted-foreground"
						: "bg-gradient-to-r from-primary to-primary/90 text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 active:scale-[0.99]",
				)}
				onClick={handleGenerate}
				disabled={sending}
			>
				{sending ? (
					<>
						<svg
							className="animate-spin"
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
						>
							<path d="M21 12a9 9 0 1 1-6.219-8.56" />
						</svg>
						{t("detail.selfMedia.initPanel.stepConfirm.generatingBtn")}
					</>
				) : (
					<>
						<svg
							width="18"
							height="18"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="M12 2v4M16.2 7.8l2.9-2.9M18 12h4M16.2 16.2l2.9 2.9M12 18v4M4.9 19.1l2.9-2.9M2 12h4M4.9 4.9l2.9 2.9" />
						</svg>
						{t("detail.selfMedia.initPanel.stepConfirm.startBtn", {
							count: data.articles.length,
						})}
					</>
				)}
			</button>
		</div>
	)
}
