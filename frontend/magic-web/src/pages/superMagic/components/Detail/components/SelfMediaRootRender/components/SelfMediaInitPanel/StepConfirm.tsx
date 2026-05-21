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
import ModelSelector from "./ModelSelector"
import {
	Sparkles,
	CheckCircle,
	AlertCircle,
	Bookmark,
	Rocket,
	Briefcase,
	MapPin,
	Users,
	FileText,
	Layers,
	ChevronRight,
} from "lucide-react"
import InlineVoiceButton from "./InlineVoiceButton"

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
		<div className="flex flex-col gap-3">
			<p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
				{t("detail.selfMedia.initPanel.stepConfirm.topicListHint")}
			</p>
			<ul className="flex flex-col gap-2.5">
				{topics.map((item) => {
					const isActive = activeTopicId === item.topicId
					return (
						<li key={item.topicId} className="animate-in fade-in duration-300">
							<button
								type="button"
								className={cn(
									"flex w-full items-center gap-4 rounded-xl border px-4 py-3.5 text-left transition-all duration-300 cursor-pointer",
									isActive
										? "border-primary bg-primary/[0.04] shadow-md shadow-primary/5"
										: "border-border/40 bg-background hover:border-primary/20 hover:bg-muted/10",
								)}
								onClick={() => onSelectTopic(item)}
							>
								<span
									className={cn(
										"flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors duration-300",
										isActive
											? "bg-primary text-primary-foreground"
											: "bg-muted text-muted-foreground",
									)}
								>
									{item.articleIndex + 1}
								</span>
								<div className="min-w-0 flex-1 space-y-0.5">
									<p className="truncate text-sm font-semibold text-foreground">
										{item.articleTitle}
									</p>
									<p className="truncate text-xs text-muted-foreground">
										{item.topicName}
									</p>
								</div>
								{isActive && (
									<span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold text-primary tracking-wide">
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
							className="flex items-center gap-4 rounded-xl border border-dashed border-border/60 bg-muted/5 px-4 py-3.5 opacity-60 animate-pulse"
						>
							<span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground font-bold">
								{topics.length + i + 1}
							</span>
							<div className="flex-1 space-y-1">
								<span className="text-xs font-semibold text-muted-foreground">
									{t("detail.selfMedia.initPanel.stepConfirm.creatingTopic")}
								</span>
							</div>
							<svg
								className="animate-spin text-muted-foreground/60"
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2.5"
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
	const [selectedModelId, setSelectedModelId] = useState<string>("")
	const [selectedImageModelId, setSelectedImageModelId] = useState<string>("")
	const [selectedVideoModelId, setSelectedVideoModelId] = useState<string>("")
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
				modelId: selectedModelId || undefined,
				imageModelId: selectedImageModelId || undefined,
				videoModelId: selectedVideoModelId || undefined,
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

	// Premium execution state screen (Sending / Completed)
	if (sent || (sending && batchTopics.length > 0)) {
		return (
			<div className="mx-auto flex max-w-xl flex-col py-6 space-y-6">
				<div className="text-center space-y-4">
					<div className="relative mx-auto flex h-20 w-20 items-center justify-center">
						{sending && (
							<div className="absolute inset-0 animate-ping rounded-full bg-primary/10" />
						)}
						<div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 shadow-inner ring-1 ring-primary/15">
							{sending ? (
								<svg
									className="animate-spin text-primary"
									width="30"
									height="28"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2.5"
								>
									<path d="M21 12a9 9 0 1 1-6.219-8.56" />
								</svg>
							) : (
								<Rocket size={32} className="text-primary animate-bounce" />
							)}
						</div>
					</div>
					<div className="space-y-1">
						<h3 className="text-xl font-extrabold tracking-tight">
							{sending
								? t(
										"detail.selfMedia.initPanel.stepConfirm.generatingTitle",
										"正在启动创作流程",
									)
								: t(
										"detail.selfMedia.initPanel.stepConfirm.doneTitle",
										"矩阵创作已成功启动",
									)}
						</h3>
						<p className="text-sm text-muted-foreground leading-relaxed">
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
				</div>

				<div className="h-px bg-border/10 my-1" />

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
		<div className="mx-auto max-w-4xl py-8 space-y-10">
			{/* High-end Page Header */}
			<div className="text-center max-w-xl mx-auto space-y-2">
				<span className="bg-gradient-to-r from-primary to-indigo-500 bg-clip-text text-[11px] font-bold tracking-[0.25em] text-transparent uppercase">
					Compilation & Release
				</span>
				<h2 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
					{t("detail.selfMedia.initPanel.stepConfirm.title", "核对并开始创作")}
				</h2>
				<p className="mt-2 text-xs md:text-sm text-muted-foreground/80 leading-relaxed font-normal">
					{t(
						"detail.selfMedia.initPanel.stepConfirm.subtitle",
						"请仔细核对您的品牌定位与选题规划，确认后 AI 操盘手将自动并行创作。",
					)}
				</p>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
				{/* Global Briefing card - Left column */}
				<div className="lg:col-span-5 space-y-6 lg:sticky lg:top-6">
					<div className="relative overflow-hidden rounded-2xl border border-primary/10 bg-gradient-to-br from-primary/[0.04] to-indigo-500/[0.005] p-6 shadow-sm">
						{/* Ambient Glow */}
						<div className="absolute right-0 top-0 -z-10 h-24 w-24 rounded-full bg-gradient-to-r from-primary/10 to-indigo-500/10 blur-2xl" />

						{/* Icon & Title */}
						<div className="mb-4 flex items-center gap-2">
							<div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary/10 to-indigo-500/10 text-primary border border-primary/15 shadow-inner">
								<Briefcase size={14} />
							</div>
							<h3 className="text-xs font-bold tracking-wider text-foreground/85 uppercase flex items-center gap-1.5">
								<span>
									{t(
										"detail.selfMedia.initPanel.stepConfirm.globalSummary",
										"全局品牌档案",
									)}
								</span>
								<span className="flex h-1.5 w-1.5 rounded-full bg-primary animate-ping" />
							</h3>
						</div>

						{/* Detail Rows */}
						<div className="space-y-4 text-xs">
							{/* Author */}
							<div className="space-y-1">
								<span className="text-muted-foreground font-semibold flex items-center gap-1">
									<MapPin size={10} className="text-primary/70" />
									<span>
										{t(
											"detail.selfMedia.initPanel.stepConfirm.accountLabel",
											"主创账号",
										)}
									</span>
								</span>
								<p className="font-bold text-sm text-foreground pl-3.5">
									{data.global.author}
								</p>
							</div>

							{/* Positioning */}
							<div className="space-y-1">
								<span className="text-muted-foreground font-semibold flex items-center gap-1">
									<Layers size={10} className="text-primary/70" />
									<span>
										{t(
											"detail.selfMedia.initPanel.stepConfirm.positionLabel",
											"品牌/IP 定位",
										)}
									</span>
								</span>
								<p className="font-bold text-sm text-foreground pl-3.5 leading-relaxed">
									{data.global.brandPosition}
								</p>
							</div>

							{/* Target Audience */}
							{data.global.targetAudience && (
								<div className="space-y-1">
									<span className="text-muted-foreground font-semibold flex items-center gap-1">
										<Users size={10} className="text-primary/70" />
										<span>
											{t(
												"detail.selfMedia.initPanel.stepConfirm.audienceLabel",
												"受众定位",
											)}
										</span>
									</span>
									<p className="font-bold text-sm text-foreground pl-3.5 leading-relaxed">
										{data.global.targetAudience}
									</p>
								</div>
							)}
						</div>
					</div>

					{/* Save template option */}
					{onSaveTemplate && !templateSaved && (
						<div className="animate-in fade-in duration-200">
							{showTemplateNameInput ? (
								<div className="flex flex-col gap-3 rounded-2xl border border-border/80 bg-background p-4 shadow-sm">
									<span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
										模板归档名称
									</span>
									<div className="flex items-center gap-2">
										<div className="group relative flex-1">
											<input
												type="text"
												className="w-full rounded-xl border border-border/40 bg-muted/10 px-3 py-2 pr-7 text-xs placeholder:text-muted-foreground/50 focus:border-primary/45 focus:bg-background outline-none transition-all duration-300"
												placeholder={t(
													"detail.selfMedia.initPanel.stepConfirm.templateNamePlaceholder",
													"输入模板名称",
												)}
												value={templateName}
												onChange={(e) => setTemplateName(e.target.value)}
												onKeyDown={(e) => {
													if (e.key === "Enter") handleSaveTemplate()
												}}
												autoFocus
											/>
											<InlineVoiceButton
												onResult={(text) =>
													setTemplateName((prev) => prev + text)
												}
											/>
										</div>
										<button
											type="button"
											className="rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/95 transition-all duration-300 disabled:opacity-40 cursor-pointer"
											onClick={handleSaveTemplate}
											disabled={!templateName.trim()}
										>
											{t(
												"detail.selfMedia.initPanel.stepConfirm.saveTemplate",
												"保存",
											)}
										</button>
										<button
											type="button"
											className="rounded-xl border border-border px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-all duration-300 cursor-pointer"
											onClick={() => setShowTemplateNameInput(false)}
										>
											{t("detail.selfMedia.initPanel.stepConfirm.cancel")}
										</button>
									</div>
								</div>
							) : (
								<button
									type="button"
									className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border px-4 py-4 text-xs font-bold text-muted-foreground transition-all duration-300 hover:border-primary/30 hover:text-foreground cursor-pointer"
									onClick={() => setShowTemplateNameInput(true)}
								>
									<Bookmark size={13} className="text-primary/70" />
									<span>
										{t(
											"detail.selfMedia.initPanel.stepConfirm.saveAsTemplate",
											"保存当前设置为全新模板",
										)}
									</span>
								</button>
							)}
						</div>
					)}

					{templateSaved && (
						<div className="flex items-center justify-center gap-2 rounded-xl bg-green-50 dark:bg-green-950/20 py-3.5 text-xs font-bold text-green-600 dark:text-green-400 border border-green-200/50 dark:border-green-900/50 animate-in fade-in duration-300">
							<CheckCircle size={14} />
							<span>
								{t(
									"detail.selfMedia.initPanel.stepConfirm.templateSaved",
									"模板保存成功",
								)}
							</span>
						</div>
					)}
				</div>

				{/* Articles List / Timeline feed - Right column */}
				<div className="lg:col-span-7 space-y-5">
					<div className="flex items-center justify-between pb-2 border-b border-border/10">
						<span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
							选题矩阵清单 ({data.articles.length} 篇)
						</span>
					</div>

					<div className="flex flex-col gap-4 relative pl-4 border-l border-border/30">
						{data.articles.map((article, index) => (
							<div
								key={index}
								className="group relative flex flex-col gap-3 rounded-2xl border border-border/50 bg-background/50 p-4 transition-all hover:shadow-md hover:border-primary/15 animate-in fade-in duration-300"
							>
								{/* Connection Timeline Node */}
								<div className="absolute -left-[24.5px] top-6 flex h-4 w-4 items-center justify-center rounded-full bg-background border-2 border-primary ring-4 ring-primary/5 shadow-sm group-hover:scale-110 transition-transform duration-300" />

								{/* Header */}
								<div className="flex items-start justify-between gap-3">
									<div className="space-y-1 flex-1">
										<div className="flex items-center gap-2">
											<span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
												ARTICLE 0{index + 1}
											</span>
										</div>
										<h4 className="text-sm font-extrabold text-foreground group-hover:text-primary transition-colors duration-300 leading-snug">
											{article.title}
										</h4>
									</div>
								</div>

								{/* Badges / Metrics */}
								<div className="flex flex-wrap gap-1.5 pt-1.5">
									{article.platform && (
										<span className="rounded-full bg-blue-500/10 border border-blue-500/20 px-2.5 py-0.5 text-[10px] font-bold text-blue-600 dark:text-blue-400">
											{getPlatformLabel(article.platform)}
										</span>
									)}
									{article.style && (
										<span className="rounded-full bg-primary/10 border border-primary/15 px-2.5 py-0.5 text-[10px] font-bold text-primary">
											{getStyleLabel(article.style)}
										</span>
									)}
									{article.outline.length > 0 && (
										<span className="rounded-full bg-muted border border-border px-2.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
											{t(
												"detail.selfMedia.initPanel.stepConfirm.outlinePoints",
												{
													count: article.outline.length,
												},
											)}
										</span>
									)}
									{article.cardCount > 0 && (
										<span className="rounded-full bg-muted border border-border px-2.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
											{t("detail.selfMedia.initPanel.stepConfirm.cardCount", {
												count: article.cardCount,
											})}
										</span>
									)}
									{collectArticleMaterials(article).length > 0 && (
										<span className="rounded-full bg-muted border border-border px-2.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
											{t("detail.selfMedia.initPanel.stepConfirm.refCount", {
												count: collectArticleMaterials(article).length,
											})}
										</span>
									)}
								</div>
							</div>
						))}
					</div>

					{/* Model selector + Start AI creation button */}
					<div className="mt-6 flex flex-col gap-3">
						<div className="flex items-center gap-2 flex-wrap">
							<ModelSelector value={selectedModelId} onChange={setSelectedModelId} />
							<ModelSelector
								value={selectedImageModelId}
								onChange={setSelectedImageModelId}
								modelType="image"
							/>
							<ModelSelector
								value={selectedVideoModelId}
								onChange={setSelectedVideoModelId}
								modelType="video"
							/>
						</div>
						<button
							type="button"
							className={cn(
								"group/btn flex flex-1 items-center justify-center gap-2.5 rounded-2xl py-4 text-xs font-bold tracking-widest uppercase transition-all duration-300 outline-none cursor-pointer",
								sending
									? "cursor-not-allowed bg-muted text-muted-foreground/60"
									: "bg-gradient-to-r from-primary to-indigo-600 text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 hover:scale-[1.015] active:scale-[0.985]",
							)}
							onClick={handleGenerate}
							disabled={sending}
						>
							{sending ? (
								<div className="flex items-center gap-2">
									<svg
										className="animate-spin text-primary-foreground"
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="2.5"
									>
										<path d="M21 12a9 9 0 1 1-6.219-8.56" />
									</svg>
									<span>
										{t(
											"detail.selfMedia.initPanel.stepConfirm.generatingBtn",
											"AI 正在并发布署中…",
										)}
									</span>
								</div>
							) : (
								<div className="flex items-center gap-2">
									<Sparkles size={14} className="group-hover/btn:animate-pulse" />
									<span>
										{t("detail.selfMedia.initPanel.stepConfirm.startBtn", {
											count: data.articles.length,
										})}
									</span>
									<ChevronRight
										size={14}
										className="group-hover/btn:translate-x-0.5 transition-transform duration-300"
									/>
								</div>
							)}
						</button>
					</div>
				</div>
			</div>
		</div>
	)
}
