import { useEffect, useMemo, useRef } from "react"
import {
	BarChart3,
	CheckCircle2,
	CircleDashed,
	FileText,
	Layers,
	Plus,
	Settings,
	Sparkles,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { observer } from "mobx-react-lite"
import { cn } from "@/lib/utils"
import MagicTooltip from "@/components/base/MagicTooltip"
import { Button } from "@/components/shadcn-ui/button"
import { ScrollArea } from "@/components/shadcn-ui/scroll-area"
import type { ScheduledTask } from "@/types/scheduledTask"
import type { SelfMediaPlatform } from "../../../types"
import { ALL_PLATFORMS } from "./SelfMediaInitPanel/types"
import type { SelfMediaPlatformPostItem } from "../stores/SelfMediaStore"
import PlatformBrandIcon from "./PlatformBrandIcon"
import CardFrame from "./CardFrame"
import { CARD_THUMBNAIL_IMAGE_PROCESS } from "../constants/imageProcess"
import type { AICardCreateInitialValues } from "./AICardCreateDialog"
import type { SelfMediaAttachmentNode } from "../types"
import SelfMediaPostCard, { type SelfMediaPostOpsArtifacts } from "./SelfMediaPostCard"
import type { SelfMediaPostOpsSourcePayload } from "../services/SelfMediaFileStorageService"

interface AICardFolderChild extends SelfMediaAttachmentNode {
	display_config?: {
		type?: string
		[key: string]: unknown
	}
}

interface AICardFolderItem extends AICardFolderChild {
	file_id: string
	children?: AICardFolderChild[]
}

interface SelfMediaHomePageProps {
	posts: SelfMediaPlatformPostItem[]
	attachmentList?: SelfMediaAttachmentNode[]
	onEnsurePostLoaded?: (target: { platform: SelfMediaPlatform; index: number }) => void
	onCreateArticle?: () => void
	onOpenPost: (target: { platform: SelfMediaPlatform; index: number }) => void
	onRequestPrePublishAnalysis?: (target: { platform: SelfMediaPlatform; index: number }) => void
	onOpenOpsMetrics?: (target: SelfMediaPlatformPostItem) => void
	onPostPublishRefresh?: (
		target: SelfMediaPlatformPostItem,
		publishedUrl?: string,
	) => Promise<void> | void
	onConfigureAutoSync?: (
		target: SelfMediaPlatformPostItem,
		config: { enabled: boolean; timeConfig: ScheduledTask.TimeConfig },
	) => Promise<boolean | void> | boolean | void
	onLoadPublishedUrl?: (
		target: SelfMediaPlatformPostItem,
	) => Promise<string | undefined> | string | undefined
	onLoadOpsSource?: (
		target: SelfMediaPlatformPostItem,
	) => Promise<SelfMediaPostOpsSourcePayload | null> | SelfMediaPostOpsSourcePayload | null
	onBindPublishedUrl?: (
		target: SelfMediaPlatformPostItem,
		publishedUrl: string,
	) => Promise<boolean | void> | boolean | void
	onOpenBrandConfig?: () => void
	onCreateAICard?: (initialValues?: AICardCreateInitialValues) => void
	onOpenAICardFolder?: (folder: AICardFolderItem) => void
	folderFileId?: string
	className?: string
}

function SelfMediaHomePage({
	posts,
	attachmentList,
	onEnsurePostLoaded,
	onCreateArticle,
	onOpenPost,
	onRequestPrePublishAnalysis,
	onOpenOpsMetrics,
	onPostPublishRefresh,
	onConfigureAutoSync,
	onLoadPublishedUrl,
	onLoadOpsSource,
	onBindPublishedUrl,
	onOpenBrandConfig,
	onCreateAICard,
	onOpenAICardFolder,
	folderFileId,
	className,
}: SelfMediaHomePageProps) {
	const { t } = useTranslation("super")
	const requestedPreviewPostKeysRef = useRef(new Set<string>())
	const hasPosts = posts.length > 0
	const postGroups = posts.reduce<
		Array<{ platform: SelfMediaPlatform; posts: SelfMediaPlatformPostItem[] }>
	>((groups, item) => {
		const group = groups.find((candidate) => candidate.platform === item.platform)
		if (group) {
			group.posts.push(item)
		} else {
			groups.push({ platform: item.platform, posts: [item] })
		}
		return groups
	}, [])
	const opsArtifactPathSet = useMemo(
		() => buildAttachmentRelativePathSet(attachmentList),
		[attachmentList],
	)
	const opsArtifactsByPostKey = useMemo(() => {
		const next = new Map<string, SelfMediaPostOpsArtifacts>()
		posts.forEach((item) => {
			next.set(getPostKey(item), getPostOpsArtifacts(item, opsArtifactPathSet))
		})
		return next
	}, [opsArtifactPathSet, posts])
	const opsOverviewItems = useMemo(() => {
		const total = posts.length
		const countReady = (key: keyof SelfMediaPostOpsArtifacts) =>
			posts.filter((item) => opsArtifactsByPostKey.get(getPostKey(item))?.[key]).length
		return [
			{
				key: "content",
				label: t("detail.selfMedia.home.opsOverview.content"),
				done: total,
				total,
			},
			{
				key: "source",
				label: t("detail.selfMedia.home.opsOverview.source"),
				done: countReady("source"),
				total,
			},
			{
				key: "metrics",
				label: t("detail.selfMedia.home.opsOverview.metrics"),
				done: countReady("metrics"),
				total,
			},
			{
				key: "comments",
				label: t("detail.selfMedia.home.opsOverview.comments"),
				done: countReady("comments"),
				total,
			},
			{
				key: "review",
				label: t("detail.selfMedia.home.opsOverview.review"),
				done: countReady("review"),
				total,
			},
		]
	}, [opsArtifactsByPostKey, posts, t])

	const getPlatformLabel = (platform: SelfMediaPlatform) => {
		const platformConfig = ALL_PLATFORMS.find((item) => item.value === platform)
		return platformConfig ? t(platformConfig.labelKey) : platform
	}

	// Find AI card folders that are children of the self-media folder
	const aiCardFolders = useMemo(() => {
		if (!attachmentList?.length || !folderFileId) return []
		// Find the self-media folder node and look at its children
		const findNode = (nodes: SelfMediaAttachmentNode[]): SelfMediaAttachmentNode | null => {
			for (const node of nodes) {
				if (node.file_id === folderFileId) return node
				if (node.is_directory && node.children?.length) {
					const result = findNode(node.children as SelfMediaAttachmentNode[])
					if (result) return result
				}
			}
			return null
		}
		const selfMediaFolder = findNode(attachmentList)
		const children = (selfMediaFolder?.children || []) as SelfMediaAttachmentNode[]
		return children.filter((node): node is AICardFolderItem =>
			Boolean(
				node.file_id && node.is_directory && isAICardDisplayConfig(node.display_config),
			),
		)
	}, [attachmentList, folderFileId])

	useEffect(() => {
		if (!onEnsurePostLoaded) return

		posts.forEach((item) => {
			if (hasHomePreviewAsset(item)) return
			const requestKey = `${item.platform}:${item.entry.id}:${item.index}`
			if (requestedPreviewPostKeysRef.current.has(requestKey)) return

			requestedPreviewPostKeysRef.current.add(requestKey)
			onEnsurePostLoaded({ platform: item.platform, index: item.index })
		})
	}, [onEnsurePostLoaded, posts])

	const buildPostReviewInitialValues = (
		item: SelfMediaPlatformPostItem,
		title: string,
	): AICardCreateInitialValues => {
		const { platform, entry, post } = item
		const platformLabel = getPlatformLabel(platform)
		const author = post.meta.author || t("detail.selfMedia.common.unknownAuthor")
		const opsBasePath = entry.entry.replace(/\/?post\.json$/, "/ops")
		const comments = Array.isArray(post.meta.comments) ? post.meta.comments : []
		const engagementLines = [
			post.meta.feedLikes
				? `- 点赞/喜欢: ${post.meta.feedLikes}`
				: "- 点赞/喜欢: 暂无真实数据，先按参考数据或待填数据处理",
			post.meta.commentCount
				? `- 评论数: ${post.meta.commentCount}`
				: "- 评论数: 暂无真实数据，先按参考数据或待填数据处理",
			post.meta.time ? `- 发布时间/展示时间: ${post.meta.time}` : null,
		].filter((line): line is string => Boolean(line))
		const commentLines = comments.length
			? comments
					.slice(0, 5)
					.map((comment) => `- ${comment.name || "用户"}: ${comment.text}`)
					.join("\n")
			: "- 暂无评论样本，请在卡片中保留可补充真实评论的位置"
		const prompt = [
			"请为这篇已发布/待复盘的自媒体内容创建一个「发布后表现复盘」AI 卡片看板。",
			"",
			"━━━ 文章信息 ━━━",
			`平台: ${platformLabel}`,
			`标题: ${title}`,
			`作者/账号: ${author}`,
			`文章文件: ${entry.entry}`,
			"",
			"━━━ 文件化运营数据 ━━━",
			`请优先读取这些项目内文件来承载复盘数据:`,
			`- ${opsBasePath}/source.json: 已发布文章链接、平台、抓取状态和最近一次抓取时间`,
			`- ${opsBasePath}/metrics.json: 曝光、阅读、点赞、收藏、评论、转发、涨粉、转化等指标`,
			`- ${opsBasePath}/comments.json: 评论样本、用户异议、咨询/购买信号`,
			`- ${opsBasePath}/review.md: 本次复盘结论和下一轮行动清单`,
			"如果 source.json 缺少真实链接，请提示用户先绑定发布后的文章链接。",
			"如果 metrics.json、comments.json 或 review.md 不存在，请在看板中显示为待归档/待补充状态。",
			"post.json.meta 中的点赞、评论和评论样本只能作为参考展示数据，不要把参考展示数据写入 ops/metrics.json、ops/comments.json 或 ops/review.md，也不要标记为已归档。",
			"",
			"━━━ 当前参考展示数据（非归档数据） ━━━",
			...engagementLines,
			"",
			"━━━ 评论/反馈样本 ━━━",
			commentLines,
			"",
			"━━━ 看板目标 ━━━",
			"请把结果做成可交互的数据面板，而不是长篇文字报告。面板需要一屏看清「表现如何、为什么、下一步做什么」。",
			"至少包含这些模块:",
			"1. 核心 KPI: 曝光/阅读、点赞、收藏、评论、转发、涨粉、转化等指标位；真实数据缺失时标注为待补充或参考值。",
			"2. 内容归因: 标题、封面/首图、开头 hook、结构节奏、选题匹配度分别打分并说明影响。",
			"3. 评论洞察: 提炼用户关心点、异议、购买/咨询信号、可二创角度。",
			"4. 下一轮动作: 给出下篇选题、标题 A/B、封面方向、发布时间、分发渠道和评论区运营动作。",
			"5. 数据口径: 区分真实平台数据、用户补充数据和参考展示数据。",
			"",
			"优先使用 analytics-panel 模板，保留筛选、指标卡、趋势/漏斗、评论洞察和行动清单等面板化交互。",
		].join("\n")

		return {
			taskName: t("detail.selfMedia.home.postReviewCardName", { title }),
			prompt,
			template: "analytics-panel",
			enabled: false,
			timeConfig: null,
		}
	}

	return (
		<div
			className={cn("flex h-full min-h-0 w-full flex-col bg-mobile-background", className)}
			data-testid="self-media-home-page"
		>
			<header className="shrink-0 border-b bg-card/95 px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-card/90 sm:px-6">
				<div className="mx-auto flex max-w-5xl flex-col gap-4 [container-type:inline-size] sm:flex-row sm:items-center sm:justify-between">
					<div className="space-y-1">
						<h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
							{t("detail.selfMedia.home.title")}
						</h2>
						<p className="text-sm text-muted-foreground">
							{t("detail.selfMedia.home.subtitle")}
						</p>
					</div>
					<div className="flex flex-nowrap items-center gap-2">
						{onOpenBrandConfig ? (
							<MagicTooltip title={t("detail.selfMedia.home.brandConfig")}>
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="text-xs [@container(max-width:599px)]:size-9 [@container(max-width:599px)]:px-0"
									onClick={onOpenBrandConfig}
									data-testid="self-media-home-brand-config-button"
								>
									<Settings size={14} className="shrink-0" />
									<span className="hidden [@container(min-width:600px)]:inline">
										{t("detail.selfMedia.home.brandConfig")}
									</span>
								</Button>
							</MagicTooltip>
						) : null}
						{onCreateAICard ? (
							<MagicTooltip title={t("detail.selfMedia.home.aiCard")}>
								<Button
									type="button"
									variant="secondary"
									size="sm"
									className="text-xs [@container(max-width:599px)]:size-9 [@container(max-width:599px)]:px-0"
									onClick={() => onCreateAICard()}
									data-testid="self-media-home-ai-card-button"
								>
									<Sparkles size={14} className="shrink-0" />
									<span className="hidden [@container(min-width:600px)]:inline">
										{t("detail.selfMedia.home.aiCard")}
									</span>
								</Button>
							</MagicTooltip>
						) : null}
						{onCreateArticle ? (
							<MagicTooltip title={t("detail.selfMedia.home.create")}>
								<Button
									type="button"
									size="sm"
									className="text-xs [@container(max-width:599px)]:size-9 [@container(max-width:599px)]:px-0"
									onClick={onCreateArticle}
									data-testid="self-media-home-create-button"
								>
									<Plus size={14} className="shrink-0" />
									<span className="hidden [@container(min-width:600px)]:inline">
										{t("detail.selfMedia.home.create")}
									</span>
								</Button>
							</MagicTooltip>
						) : null}
					</div>
				</div>
			</header>

			<main className="min-h-0 flex-1">
				<ScrollArea className="h-full">
					<div className="mx-auto max-w-5xl px-4 py-4 sm:px-6 sm:py-6">
						{hasPosts ? (
							<section
								className="mb-6 rounded-lg border bg-card p-4 shadow-xs"
								data-testid="self-media-home-ops-overview"
							>
								<div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
									<BarChart3 size={14} />
									<span>{t("detail.selfMedia.home.opsOverview.title")}</span>
								</div>
								<div className="grid gap-2 sm:grid-cols-5">
									{opsOverviewItems.map((item) => {
										const complete = item.total > 0 && item.done === item.total
										return (
											<div
												key={item.key}
												className="flex min-h-16 flex-col justify-between rounded-md border bg-background px-3 py-2"
												data-testid={`self-media-home-ops-overview-${item.key}`}
											>
												<div className="flex items-center justify-between gap-2">
													<span className="truncate text-xs text-muted-foreground">
														{item.label}
													</span>
													{complete ? (
														<CheckCircle2 className="size-3.5 shrink-0 text-primary" />
													) : (
														<CircleDashed className="size-3.5 shrink-0 text-muted-foreground" />
													)}
												</div>
												<span className="text-lg font-semibold leading-none text-foreground">
													{t(
														"detail.selfMedia.home.opsOverview.progress",
														{
															done: item.done,
															total: item.total,
														},
													)}
												</span>
											</div>
										)
									})}
								</div>
							</section>
						) : null}
						{aiCardFolders.length > 0 && onOpenAICardFolder ? (
							<section
								className="mb-6 space-y-4"
								data-testid="self-media-home-ai-card-list"
							>
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-2 text-sm font-medium text-foreground">
										<Sparkles size={14} />
										<span>
											{t("detail.selfMedia.home.aiCardCount", {
												count: aiCardFolders.length,
											})}
										</span>
									</div>
								</div>
								<div className="grid gap-3 md:grid-cols-2">
									{aiCardFolders.map((folder) => {
										const name =
											folder.file_name || t("detail.selfMedia.home.aiCard")
										const latestHtml = folder.children?.find(
											(child) =>
												child.file_name === "latest.html" &&
												!child.is_directory,
										)
										return (
											<button
												key={folder.file_id}
												type="button"
												className="group flex min-h-28 cursor-pointer flex-col gap-3 rounded-lg border bg-card p-4 text-left text-card-foreground shadow-xs transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.99]"
												onClick={() => onOpenAICardFolder(folder)}
												data-testid={`self-media-home-ai-card-open-${folder.file_id}`}
											>
												<div className="flex items-start gap-3">
													<div className="flex h-[4.5rem] w-[3.375rem] shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground">
														{latestHtml?.file_id ? (
															<div className="pointer-events-none h-full w-full bg-white">
																<CardFrame
																	cardId={`home-aicard-${folder.file_id}`}
																	fileId={latestHtml.file_id}
																	version={latestHtml.updated_at}
																	attachmentList={attachmentList}
																	imageProcessOptions={
																		CARD_THUMBNAIL_IMAGE_PROCESS
																	}
																	className="h-full w-full"
																	title={name}
																/>
															</div>
														) : (
															<Sparkles size={17} />
														)}
													</div>
													<div className="min-w-0 flex-1 space-y-1">
														<h3 className="truncate text-sm font-medium text-foreground">
															{name}
														</h3>
														<p className="text-xs text-muted-foreground">
															{t("detail.selfMedia.home.aiCard")}
														</p>
													</div>
												</div>
											</button>
										)
									})}
								</div>
							</section>
						) : null}
						{hasPosts ? (
							<section className="space-y-4" data-testid="self-media-home-post-list">
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-2 text-sm font-medium text-foreground">
										<Layers size={14} />
										<span>
											{t("detail.selfMedia.home.articleCount", {
												count: posts.length,
											})}
										</span>
									</div>
								</div>
								<div className="space-y-6">
									{postGroups.map(({ platform, posts: platformPosts }) => (
										<section
											key={platform}
											className="space-y-3"
											data-testid={`self-media-home-platform-group-${platform}`}
										>
											<div className="flex items-center gap-2">
												<PlatformBrandIcon
													platform={platform}
													className="size-4 shrink-0"
												/>
												<h3 className="text-sm font-medium text-foreground">
													{getPlatformLabel(platform)}
												</h3>
											</div>
											<div className="grid gap-3 md:grid-cols-2">
												{platformPosts.map((item) => {
													const { post, index } = item
													const postId =
														post.meta.id || `${platform}-post-${index}`
													const title =
														post.meta.feedTitle ||
														post.meta.title ||
														t(
															"detail.selfMedia.common.postFallbackTitle",
															{
																index: index + 1,
															},
														)
													const subtitle =
														post.meta.subtitle || post.meta.author || ""
													const opsArtifacts = opsArtifactsByPostKey.get(
														getPostKey(item),
													) ?? {
														source: false,
														metrics: false,
														comments: false,
														review: false,
													}

													return (
														<SelfMediaPostCard
															key={`${platform}-${postId}`}
															item={item}
															title={title}
															subtitle={subtitle}
															postId={postId}
															opsArtifacts={opsArtifacts}
															attachmentList={attachmentList}
															onOpenPost={onOpenPost}
															onRequestPrePublishAnalysis={
																onRequestPrePublishAnalysis
															}
															onOpenOpsMetrics={onOpenOpsMetrics}
															onPostPublishRefresh={
																onPostPublishRefresh
															}
															onConfigureAutoSync={
																onConfigureAutoSync
															}
															onLoadPublishedUrl={onLoadPublishedUrl}
															onLoadOpsSource={onLoadOpsSource}
															onBindPublishedUrl={onBindPublishedUrl}
															onCreateAICard={onCreateAICard}
															buildPostReviewInitialValues={
																buildPostReviewInitialValues
															}
														/>
													)
												})}
											</div>
										</section>
									))}
								</div>
							</section>
						) : (
							<section
								className="flex min-h-[22rem] flex-col items-center justify-center gap-4 rounded-lg border border-dashed bg-card px-6 py-10 text-center shadow-xs"
								data-testid="self-media-home-empty"
							>
								<div className="flex h-14 w-14 items-center justify-center rounded-lg bg-muted text-muted-foreground">
									<FileText size={24} />
								</div>
								<div className="space-y-1">
									<h3 className="text-lg font-semibold text-foreground">
										{t("detail.selfMedia.home.emptyTitle")}
									</h3>
									<p className="text-sm text-muted-foreground">
										{t("detail.selfMedia.home.emptyDesc")}
									</p>
								</div>
								<Button
									type="button"
									size="sm"
									className="text-xs"
									onClick={onCreateArticle}
									data-testid="self-media-home-empty-create-button"
								>
									<Plus size={14} />
									<span>{t("detail.selfMedia.home.create")}</span>
								</Button>
							</section>
						)}
					</div>
				</ScrollArea>
			</main>
		</div>
	)
}

function hasHomePreviewAsset({ platform, post }: SelfMediaPlatformPostItem) {
	if (platform === "wechat-official-accounts") {
		const cover = post.thumbnailCover || post.heroCover
		return Boolean(cover?.fileId || cover?.url)
	}
	const card = post.cards[0]
	return Boolean(card?.fileId || card?.url)
}

function isAICardDisplayConfig(value: unknown): value is { type: "ai-card" } {
	return Boolean(
		value && typeof value === "object" && "type" in value && value.type === "ai-card",
	)
}

function getPostKey(item: SelfMediaPlatformPostItem) {
	return `${item.platform}:${item.index}:${item.entry.entry}`
}

function buildAttachmentRelativePathSet(attachmentList?: SelfMediaAttachmentNode[]) {
	const paths = new Set<string>()
	const visit = (nodes?: SelfMediaAttachmentNode[]) => {
		nodes?.forEach((node) => {
			if (node.relative_file_path) paths.add(normalizeRelativePath(node.relative_file_path))
			if (node.children?.length) visit(node.children as SelfMediaAttachmentNode[])
		})
	}
	visit(attachmentList)
	return paths
}

function getPostOpsArtifacts(
	item: SelfMediaPlatformPostItem,
	artifactPaths: Set<string>,
): SelfMediaPostOpsArtifacts {
	const opsPath = item.entry.entry.replace(/\/?post\.json$/, "/ops")
	return {
		source: hasArtifactPath(artifactPaths, `${opsPath}/source.json`),
		metrics: hasArtifactPath(artifactPaths, `${opsPath}/metrics.json`),
		comments: hasArtifactPath(artifactPaths, `${opsPath}/comments.json`),
		review: hasArtifactPath(artifactPaths, `${opsPath}/review.md`),
	}
}

function hasArtifactPath(artifactPaths: Set<string>, targetPath: string) {
	const normalizedTarget = normalizeRelativePath(targetPath)
	if (artifactPaths.has(normalizedTarget)) return true
	const suffix = `/${normalizedTarget}`
	for (const path of artifactPaths) {
		if (path.endsWith(suffix)) return true
	}
	return false
}

function normalizeRelativePath(path: string) {
	return path.replace(/^\/+/, "").replace(/\/+/g, "/").replace(/\/+$/, "")
}

export default observer(SelfMediaHomePage)
