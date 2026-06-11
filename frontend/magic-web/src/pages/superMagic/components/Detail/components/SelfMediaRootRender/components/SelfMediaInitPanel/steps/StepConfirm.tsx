import { useCallback, useState } from "react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/shadcn-ui/badge"
import { Button } from "@/components/shadcn-ui/button"
import { Input } from "@/components/shadcn-ui/input"
import superMagicService from "@/pages/superMagic/services"
import type { SelfMediaInitData, OutlineNode } from "../types"
import { ALL_PLATFORMS, STYLE_PRESETS, collectArticleMaterials } from "../types"
import type { SelfMediaPlatform } from "../../../../../types"
import {
	navigateToBatchTopic,
	sendArticleBatch,
	type ArticleBatchProgressPhase,
	type ArticleBatchTopicItem,
} from "../../../services/selfMediaBatchSend"
import { prefillSelfMediaMagicProjectIndex, type AttachmentNode } from "../../../services"
import { ensureArticlePostAssetDirectories } from "../../../services/selfMediaPostPaths"
import ModelSelector from "../components/picker/ModelSelector"
import {
	Sparkles,
	CheckCircle,
	Bookmark,
	Rocket,
	ChevronRight,
	Briefcase,
	Home,
	Image as ImageIcon,
	Loader2,
	Target,
	UserRound,
	UsersRound,
	type LucideIcon,
} from "lucide-react"
import InlineVoiceButton from "../components/ui/InlineVoiceButton"
import PlatformBrandIcon from "../../PlatformBrandIcon"

interface StepConfirmProps {
	data: SelfMediaInitData
	selectedProject?: { id: string } | null
	folderFileId?: string
	folderPath?: string
	attachmentList?: AttachmentNode[]
	onSaveTemplate?: (name: string) => Promise<void>
	onArchiveDraft?: () => Promise<void>
	onGenerateFailed?: () => void
	onBackHome?: () => void
}

type GenerationPhase = "idle" | "archiving" | ArticleBatchProgressPhase

function isCardBasedPlatform(platform?: SelfMediaPlatform): boolean {
	return platform === "rednote" || platform === "instagram"
}

function ConfirmOutlinePreview({ nodes, depth = 0 }: { nodes: OutlineNode[]; depth?: number }) {
	if (nodes.length === 0) return null

	return (
		<ul className={cn("space-y-1.5", depth > 0 && "ml-3 border-l border-zinc-200/80 pl-3")}>
			{nodes.map((node) => (
				<li key={node.id} className="space-y-1.5">
					<p className="text-xs leading-relaxed text-foreground/80">{node.text}</p>
					{node.children?.length ? (
						<ConfirmOutlinePreview nodes={node.children} depth={depth + 1} />
					) : null}
				</li>
			))}
		</ul>
	)
}

function ConfirmBrandFieldRow({
	Icon,
	label,
	value,
}: {
	Icon: LucideIcon
	label: string
	value: string
}) {
	if (!value.trim()) return null

	return (
		<div className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-start gap-x-3 border-b px-4 py-4 last:border-b-0 sm:grid-cols-[2.75rem_minmax(0,1fr)] sm:gap-x-3.5">
			<div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted text-muted-foreground sm:h-11 sm:w-11">
				<Icon size={18} />
			</div>
			<div className="min-w-0 space-y-1">
				<span className="text-xs font-medium text-muted-foreground">{label}</span>
				<p className="text-sm font-medium leading-relaxed text-foreground">{value}</p>
			</div>
		</div>
	)
}

function ConfirmBrandSummary({
	global,
	t,
}: {
	global: SelfMediaInitData["global"]
	t: (key: string, opts?: Record<string, unknown>) => string
}) {
	const brandImageCount = global.brandImages?.length ?? 0

	return (
		<section className="space-y-3" data-testid="self-media-step-confirm-global-summary">
			<div className="flex items-center gap-2 border-b pb-2">
				<div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
					<Briefcase size={13} />
				</div>
				<h3 className="text-sm font-semibold text-foreground">
					{t("detail.selfMedia.initPanel.stepConfirm.globalSummary", {
						defaultValue: "全局品牌档案",
					})}
				</h3>
			</div>

			<div className="overflow-hidden rounded-lg border bg-card shadow-xs">
				<ConfirmBrandFieldRow
					Icon={UserRound}
					label={t("detail.selfMedia.initPanel.stepConfirm.accountLabel", {
						defaultValue: "主创账号",
					})}
					value={global.author}
				/>
				<ConfirmBrandFieldRow
					Icon={Target}
					label={t("detail.selfMedia.initPanel.stepConfirm.positionLabel", {
						defaultValue: "品牌/IP 定位",
					})}
					value={global.brandPosition}
				/>
				<ConfirmBrandFieldRow
					Icon={UsersRound}
					label={t("detail.selfMedia.initPanel.stepConfirm.audienceLabel", {
						defaultValue: "受众定位",
					})}
					value={global.targetAudience}
				/>
				{brandImageCount > 0 ? (
					<ConfirmBrandFieldRow
						Icon={ImageIcon}
						label={t("detail.selfMedia.initPanel.stepBrand.brandImages", {
							defaultValue: "品牌形象素材",
						})}
						value={t("detail.selfMedia.initPanel.stepConfirm.brandAssetCount", {
							count: brandImageCount,
						})}
					/>
				) : null}
			</div>
		</section>
	)
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
			<p className="text-xs font-medium text-muted-foreground">
				{t("detail.selfMedia.initPanel.stepConfirm.topicListHint")}
			</p>
			<ul className="flex flex-col gap-2.5">
				{topics.map((item) => {
					const isActive = activeTopicId === item.topicId
					return (
						<li key={item.topicId} className="duration-300 animate-in fade-in">
							<Button
								type="button"
								variant="outline"
								className={cn(
									"h-auto w-full justify-start gap-4 rounded-lg p-4 text-left shadow-xs",
									isActive
										? "border-primary bg-primary/5"
										: "bg-card hover:bg-accent/50",
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
									<Badge variant="secondary" className="shrink-0 rounded-md">
										{t("detail.selfMedia.initPanel.stepConfirm.viewing")}
									</Badge>
								)}
							</Button>
						</li>
					)
				})}
				{isGenerating &&
					Array.from({ length: Math.max(0, totalCount - topics.length) }).map((_, i) => (
						<li
							key={`pending-${i}`}
							className="flex animate-pulse items-center gap-4 rounded-lg border bg-card px-4 py-3.5 opacity-60"
						>
							<span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
								{topics.length + i + 1}
							</span>
							<div className="flex-1 space-y-1">
								<span className="text-xs font-semibold text-muted-foreground">
									{t("detail.selfMedia.initPanel.stepConfirm.creatingTopic")}
								</span>
							</div>
							<Loader2 size={14} className="animate-spin text-muted-foreground/60" />
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
	attachmentList,
	onSaveTemplate,
	onArchiveDraft,
	onGenerateFailed,
	onBackHome,
}: StepConfirmProps) {
	const [sending, setSending] = useState(false)
	const [sent, setSent] = useState(false)
	const [batchTopics, setBatchTopics] = useState<ArticleBatchTopicItem[]>([])
	const [activeTopicId, setActiveTopicId] = useState<string | null>(null)
	const [generationPhase, setGenerationPhase] = useState<GenerationPhase>("idle")
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
		setGenerationPhase("archiving")
		setBatchTopics([])
		setActiveTopicId(null)

		let isFirstTopic = true

		try {
			const selfMediaProjectDirectory = folderPath
				? {
						directoryId: folderFileId,
						directoryPath: folderPath,
						directoryName: folderPath.split("/").filter(Boolean).pop(),
					}
				: undefined
			await onArchiveDraft?.()
			const postTargets = await ensureArticlePostAssetDirectories({
				projectId,
				rootDirectoryId: folderFileId,
				rootPath: folderPath,
				articles: data.articles,
				existingNodes: attachmentList,
			})
			await prefillSelfMediaMagicProjectIndex({
				articles: data.articles,
				attachmentList,
				folderFileId,
				postTargets,
			})
			setGenerationPhase("creating-topic")
			const created = await sendArticleBatch({
				articles: data.articles,
				globalSettings: data.global,
				selectedProject,
				modelId: selectedModelId || undefined,
				imageModelId: selectedImageModelId || undefined,
				videoModelId: selectedVideoModelId || undefined,
				selfMediaProjectDirectory,
				postTargets,
				onTopicCreated: (item) => {
					setBatchTopics((prev) => [...prev, item])
					if (isFirstTopic) {
						isFirstTopic = false
						setActiveTopicId(item.topicId)
						navigateToBatchTopic(projectId, item.topic)
					}
				},
				onProgress: (phase) => {
					setGenerationPhase(phase)
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
			setGenerationPhase("idle")
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

	// Premium execution state screen (Sending / Completed)
	if (sent || sending) {
		const isStartupLoading = sending && batchTopics.length === 0
		const titleKey = sent
			? "detail.selfMedia.initPanel.stepConfirm.doneTitle"
			: isStartupLoading
				? "detail.selfMedia.initPanel.stepConfirm.preparingTitle"
				: "detail.selfMedia.initPanel.stepConfirm.generatingTitle"
		const titleFallback = sent
			? "矩阵创作已成功启动"
			: isStartupLoading
				? "正在准备创作任务"
				: "正在启动创作流程"
		const desc = sent
			? t("detail.selfMedia.initPanel.stepConfirm.doneDesc", {
					count: data.articles.length,
				})
			: isStartupLoading
				? t(`detail.selfMedia.initPanel.stepConfirm.phase.${generationPhase}`, {
						defaultValue: t("detail.selfMedia.initPanel.stepConfirm.preparingDesc"),
					})
				: t("detail.selfMedia.initPanel.stepConfirm.generatingDesc", {
						done: batchTopics.length,
						total: data.articles.length,
					})

		return (
			<div
				className="mx-auto flex max-w-xl flex-col space-y-6 px-3 py-6 sm:px-4"
				data-testid={
					isStartupLoading
						? "self-media-step-confirm-startup-loading"
						: "self-media-step-confirm-progress"
				}
			>
				<div className="space-y-4 text-center">
					<div className="relative mx-auto flex h-20 w-20 items-center justify-center">
						{sending && (
							<div className="absolute inset-0 animate-ping rounded-full bg-primary/10" />
						)}
						<div className="relative flex h-20 w-20 items-center justify-center rounded-lg bg-primary/10 text-primary">
							{sending ? (
								<Loader2 size={30} className="animate-spin" />
							) : (
								<Rocket size={32} className="animate-bounce" />
							)}
						</div>
					</div>
					<div className="space-y-1">
						<h3 className="text-xl font-semibold tracking-tight">
							{t(titleKey, { defaultValue: titleFallback })}
						</h3>
						<p className="text-sm leading-relaxed text-muted-foreground">{desc}</p>
					</div>
				</div>

				<div className="my-1 h-px bg-border/10" />

				{isStartupLoading ? (
					<div className="space-y-3 rounded-lg border bg-card p-4 text-left shadow-xs">
						<p className="text-xs font-medium text-muted-foreground">
							{t("detail.selfMedia.initPanel.stepConfirm.preparingHint", {
								defaultValue: "正在归档方案、准备素材，并创建第一个创作话题",
							})}
						</p>
						<div className="h-1 overflow-hidden rounded-full bg-primary/10">
							<div className="h-full w-1/3 animate-pulse bg-primary" />
						</div>
					</div>
				) : (
					<TopicProgressList
						topics={batchTopics}
						activeTopicId={activeTopicId}
						totalCount={data.articles.length}
						isGenerating={sending}
						onSelectTopic={handleSwitchTopic}
						t={t}
					/>
				)}
				{onBackHome ? (
					<Button
						type="button"
						variant="outline"
						className="w-full"
						onClick={onBackHome}
						data-testid="self-media-step-confirm-progress-back-home-button"
					>
						<Home size={14} />
						<span>{t("detail.selfMedia.initPanel.stepConfirm.backHome")}</span>
					</Button>
				) : null}
			</div>
		)
	}

	return (
		<div className="mx-auto flex min-h-full max-w-3xl flex-col px-3 sm:px-4">
			<div className="flex-1 space-y-6 py-6 pb-8 sm:py-8">
				{/* Page header — stable text + illustration grid (no absolute overlap) */}
				<div className="rounded-lg border bg-card p-4 shadow-xs sm:p-5">
					<div className="grid items-center gap-5 sm:grid-cols-[minmax(0,1fr)_11rem] sm:gap-6">
						<div className="space-y-2 text-center sm:text-left">
							<Badge variant="secondary" className="rounded-md">
								Compilation & Release
							</Badge>
							<h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
								{t(
									"detail.selfMedia.initPanel.stepConfirm.title",
									"核对并开始创作",
								)}
							</h2>
							<p className="max-w-lg text-xs font-medium leading-relaxed text-muted-foreground sm:text-sm">
								{t(
									"detail.selfMedia.initPanel.stepConfirm.subtitle",
									"请仔细核对您的品牌定位与选题规划，确认后 AI 创作助手将自动并行创作。",
								)}
							</p>
						</div>
						<div
							className="mx-auto hidden h-[7.5rem] w-full max-w-[11rem] rounded-lg border bg-muted/40 p-3 sm:block"
							data-testid="self-media-step-confirm-title-illustration"
						>
							<div className="flex h-full flex-col justify-between">
								<div className="flex items-center justify-between">
									<span className="h-8 w-8 rounded-md bg-background shadow-xs" />
									<Rocket size={20} className="text-primary" />
								</div>
								<div className="space-y-2">
									<span className="block h-2.5 w-24 rounded-full bg-muted-foreground/20" />
									<span className="block h-2.5 w-16 rounded-full bg-muted-foreground/10" />
								</div>
							</div>
						</div>
					</div>
				</div>

				<ConfirmBrandSummary global={data.global} t={t} />

				{/* Article list */}
				<section className="space-y-4" data-testid="self-media-step-confirm-article-list">
					<div className="flex items-center justify-between border-b pb-2">
						<span className="text-sm font-semibold text-foreground">
							选题矩阵清单 ({data.articles.length} 篇)
						</span>
					</div>

					<ul className="flex flex-col gap-3">
						{data.articles.map((article, index) => {
							const showCardCount = isCardBasedPlatform(article.platform)
							const materialCount = collectArticleMaterials(article).length

							return (
								<li
									key={index}
									className="group flex flex-col gap-3 rounded-lg border bg-card px-4 py-3.5 shadow-xs transition-all duration-300 animate-in fade-in hover:border-primary/40 hover:bg-accent/30"
								>
									<div className="flex items-start gap-3">
										<Badge className="h-7 w-7 shrink-0 rounded-md px-0 text-[10px]">
											{String(index + 1).padStart(2, "0")}
										</Badge>
										<div className="min-w-0 flex-1 space-y-2">
											<div className="flex items-start gap-2">
												{article.platform ? (
													<PlatformBrandIcon
														platform={article.platform}
														className="mt-0.5 size-3.5 shrink-0"
													/>
												) : null}
												<h4 className="min-w-0 flex-1 text-sm font-semibold leading-snug text-foreground transition-colors duration-300 group-hover:text-primary">
													{article.title}
												</h4>
											</div>
											<div className="flex flex-wrap gap-1.5">
												{article.platform && (
													<Badge variant="outline" className="rounded-md">
														{getPlatformLabel(article.platform)}
													</Badge>
												)}
												{article.style && (
													<Badge
														variant="secondary"
														className="rounded-md"
													>
														{getStyleLabel(article.style)}
													</Badge>
												)}
												{showCardCount && article.cardCount > 0 && (
													<Badge variant="outline" className="rounded-md">
														{t(
															"detail.selfMedia.initPanel.stepConfirm.cardCount",
															{ count: article.cardCount },
														)}
													</Badge>
												)}
												{materialCount > 0 && (
													<Badge variant="outline" className="rounded-md">
														{t(
															"detail.selfMedia.initPanel.stepConfirm.refCount",
															{
																count: materialCount,
															},
														)}
													</Badge>
												)}
											</div>

											{article.outline.length > 0 ? (
												<div className="space-y-1.5 rounded-md border bg-muted/20 p-3">
													<span className="text-xs font-medium text-muted-foreground">
														{t(
															showCardCount
																? "detail.selfMedia.initPanel.stepConfirm.cardOutlineLabel"
																: "detail.selfMedia.initPanel.stepDetail.outlineLabel",
															showCardCount ? "卡片大纲" : "文章大纲",
														)}
													</span>
													<ConfirmOutlinePreview
														nodes={article.outline}
													/>
												</div>
											) : null}
										</div>
									</div>
								</li>
							)
						})}
					</ul>
				</section>

				{/* Save template — scrolls above sticky action bar */}
				{onSaveTemplate && !templateSaved && (
					<section className="duration-200 animate-in fade-in">
						{showTemplateNameInput ? (
							<div className="flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-xs">
								<span className="text-xs font-medium text-muted-foreground">
									模板归档名称
								</span>
								<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
									<div className="group relative flex-1">
										<Input
											type="text"
											className="h-9 pr-8 text-xs"
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
											value={templateName}
											onResult={setTemplateName}
										/>
									</div>
									<div className="flex shrink-0 gap-2">
										<Button
											type="button"
											size="sm"
											onClick={handleSaveTemplate}
											disabled={!templateName.trim()}
										>
											{t(
												"detail.selfMedia.initPanel.stepConfirm.saveTemplate",
												"保存",
											)}
										</Button>
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={() => setShowTemplateNameInput(false)}
										>
											{t("detail.selfMedia.initPanel.stepConfirm.cancel")}
										</Button>
									</div>
								</div>
							</div>
						) : (
							<Button
								type="button"
								variant="outline"
								className="h-12 w-full"
								onClick={() => setShowTemplateNameInput(true)}
							>
								<Bookmark size={13} className="text-primary/70" />
								<span>
									{t(
										"detail.selfMedia.initPanel.stepConfirm.saveAsTemplate",
										"保存当前设置为全新模板",
									)}
								</span>
							</Button>
						)}
					</section>
				)}

				{templateSaved && (
					<div className="flex items-center justify-center gap-2 rounded-lg border border-green-200 bg-green-50 py-3.5 text-xs font-medium text-green-700 duration-300 animate-in fade-in dark:border-green-900/50 dark:bg-green-950/20 dark:text-green-400">
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

			{/* Model selectors + primary action — sticky bottom */}
			<section
				className="sticky bottom-0 z-20 -mx-3 space-y-3 border-t bg-card/95 px-3 pb-[max(var(--safe-area-inset-bottom),1rem)] pt-4 shadow-lg backdrop-blur-sm supports-[backdrop-filter]:bg-card/90 sm:-mx-4 sm:px-4"
				data-testid="self-media-step-confirm-actions"
			>
				<span className="text-xs font-medium text-muted-foreground">
					{t("detail.selfMedia.initPanel.stepConfirm.modelSettings", {
						defaultValue: "模型配置",
					})}
				</span>

				<div className="grid grid-cols-1 gap-2 overflow-hidden rounded-lg border bg-background p-2 shadow-xs sm:grid-cols-3">
					<div className="flex min-w-0 flex-col gap-1 px-2 py-2.5 sm:px-3">
						<span className="truncate text-xs font-medium text-muted-foreground">
							{t("detail.selfMedia.initPanel.stepConfirm.textModel", {
								defaultValue: "文本模型",
							})}
						</span>
						<ModelSelector
							value={selectedModelId}
							onChange={setSelectedModelId}
							className="border-none bg-transparent p-0 shadow-none hover:bg-transparent"
						/>
					</div>
					<div className="flex min-w-0 flex-col gap-1 px-2 py-2.5 sm:px-3">
						<span className="truncate text-xs font-medium text-muted-foreground">
							{t("detail.selfMedia.initPanel.stepConfirm.imageModel", {
								defaultValue: "图像模型",
							})}
						</span>
						<ModelSelector
							value={selectedImageModelId}
							onChange={setSelectedImageModelId}
							modelType="image"
							className="border-none bg-transparent p-0 shadow-none hover:bg-transparent"
						/>
					</div>
					<div className="flex min-w-0 flex-col gap-1 px-2 py-2.5 sm:px-3">
						<span className="truncate text-xs font-medium text-muted-foreground">
							{t("detail.selfMedia.initPanel.stepConfirm.videoModel", {
								defaultValue: "视频模型",
							})}
						</span>
						<ModelSelector
							value={selectedVideoModelId}
							onChange={setSelectedVideoModelId}
							modelType="video"
							className="border-none bg-transparent p-0 shadow-none hover:bg-transparent"
						/>
					</div>
				</div>

				<div className="flex flex-col gap-2 sm:flex-row">
					{onBackHome ? (
						<Button
							type="button"
							variant="outline"
							className="h-11 sm:w-44"
							onClick={onBackHome}
							data-testid="self-media-step-confirm-back-home-button"
						>
							<Home size={14} />
							<span>{t("detail.selfMedia.initPanel.stepConfirm.backHome")}</span>
						</Button>
					) : null}
					<Button
						type="button"
						className={cn("group/btn h-11 flex-1", sending && "cursor-not-allowed")}
						onClick={handleGenerate}
						disabled={sending}
					>
						{sending ? (
							<div className="flex items-center gap-2">
								<Loader2 size={16} className="animate-spin" />
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
									className="transition-transform duration-300 group-hover/btn:translate-x-0.5"
								/>
							</div>
						)}
					</Button>
				</div>
			</section>
		</div>
	)
}
