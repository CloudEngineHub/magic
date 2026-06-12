import { useEffect, useMemo, useRef, useState } from "react"
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
import SelfMediaPostCard from "./SelfMediaPostCard"
import type {
	SelfMediaPostOpsMetricsPayload,
	SelfMediaPostOpsSourcePayload,
} from "../services/SelfMediaFileStorageService"
import {
	buildPostOpsArtifactStates,
	diffPostOpsArtifactAnimations,
	getPostOpsArtifacts,
	type SelfMediaPostOpsArtifacts,
	type SelfMediaPostOpsArtifactStates,
} from "../services/selfMediaOpsArtifactStates"
import SelfMediaOpsReviewDashboard, {
	type SelfMediaOpsReviewData,
} from "./SelfMediaOpsReviewDashboard"

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
	onLoadOpsReviewData?: (target: SelfMediaPlatformPostItem) => Promise<SelfMediaOpsReviewData>
	onLoadOpsMetrics?: (
		target: SelfMediaPlatformPostItem,
	) => Promise<SelfMediaPostOpsMetricsPayload | null> | SelfMediaPostOpsMetricsPayload | null
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
	onLoadOpsReviewData,
	onLoadOpsMetrics,
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
	const requestedOpsMetricsPostKeysRef = useRef(new Set<string>())
	const currentOpsArtifactStatesRef = useRef(new Map<string, SelfMediaPostOpsArtifactStates>())
	const previousOpsArtifactStatesRef = useRef(new Map<string, SelfMediaPostOpsArtifactStates>())
	const [activeOpsReviewTarget, setActiveOpsReviewTarget] =
		useState<SelfMediaPlatformPostItem | null>(null)
	const [opsMetricsByPostKey, setOpsMetricsByPostKey] = useState(
		() => new Map<string, SelfMediaPostOpsMetricsPayload | null>(),
	)
	const [opsArtifactAnimationsByPostKey, setOpsArtifactAnimationsByPostKey] = useState(
		() => new Map<string, ReturnType<typeof diffPostOpsArtifactAnimations>>(),
	)
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
	const opsArtifactStatesByPostKey = new Map<string, SelfMediaPostOpsArtifactStates>()
	posts.forEach((item) => {
		opsArtifactStatesByPostKey.set(
			getPostKey(item),
			buildPostOpsArtifactStates(item, attachmentList),
		)
	})
	currentOpsArtifactStatesRef.current = opsArtifactStatesByPostKey
	const opsArtifactStateSignature = buildOpsArtifactStateSignature(opsArtifactStatesByPostKey)
	const opsArtifactsByPostKey = new Map<string, SelfMediaPostOpsArtifacts>()
	opsArtifactStatesByPostKey.forEach((states, postKey) => {
		opsArtifactsByPostKey.set(postKey, getPostOpsArtifacts(states))
	})
	const opsOverviewItems = (() => {
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
	})()

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

	useEffect(() => {
		const previous = previousOpsArtifactStatesRef.current
		const currentStates = currentOpsArtifactStatesRef.current
		const nextAnimations = new Map<string, ReturnType<typeof diffPostOpsArtifactAnimations>>()
		currentStates.forEach((states, postKey) => {
			const prevStates = previous.get(postKey)
			if (!prevStates) return
			const animations = diffPostOpsArtifactAnimations(prevStates, states)
			if (Object.keys(animations).length > 0) nextAnimations.set(postKey, animations)
		})
		previousOpsArtifactStatesRef.current = new Map(currentStates)
		setOpsArtifactAnimationsByPostKey((current) => {
			if (nextAnimations.size === 0 && current.size === 0) return current
			return nextAnimations
		})
		if (nextAnimations.size === 0) return undefined

		const timer = window.setTimeout(() => {
			setOpsArtifactAnimationsByPostKey(new Map())
		}, 1400)
		return () => window.clearTimeout(timer)
	}, [opsArtifactStateSignature])

	useEffect(() => {
		if (!onLoadOpsMetrics) return

		let cancelled = false
		posts.forEach((item) => {
			const postKey = getPostKey(item)
			if (requestedOpsMetricsPostKeysRef.current.has(postKey)) return

			requestedOpsMetricsPostKeysRef.current.add(postKey)
			void Promise.resolve(onLoadOpsMetrics(item))
				.then((metrics) => {
					if (cancelled) return
					setOpsMetricsByPostKey((current) => {
						const next = new Map(current)
						next.set(postKey, metrics)
						return next
					})
				})
				.catch(() => {
					if (cancelled) return
					setOpsMetricsByPostKey((current) => {
						const next = new Map(current)
						next.set(postKey, null)
						return next
					})
				})
		})

		return () => {
			cancelled = true
		}
	}, [onLoadOpsMetrics, posts])

	return (
		<div
			className={cn(
				"relative flex h-full min-h-0 w-full flex-col bg-mobile-background",
				className,
			)}
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
													const opsMetrics =
														opsMetricsByPostKey.get(getPostKey(item)) ??
														null

													return (
														<SelfMediaPostCard
															key={`${platform}-${postId}`}
															item={item}
															title={title}
															subtitle={subtitle}
															postId={postId}
															opsArtifacts={opsArtifacts}
															opsArtifactAnimations={opsArtifactAnimationsByPostKey.get(
																getPostKey(item),
															)}
															opsMetrics={opsMetrics}
															attachmentList={attachmentList}
															onOpenPost={onOpenPost}
															onRequestPrePublishAnalysis={
																onRequestPrePublishAnalysis
															}
															onPostPublishRefresh={
																onPostPublishRefresh
															}
															onConfigureAutoSync={
																onConfigureAutoSync
															}
															onOpenOpsReview={
																setActiveOpsReviewTarget
															}
															onLoadPublishedUrl={onLoadPublishedUrl}
															onLoadOpsSource={onLoadOpsSource}
															onBindPublishedUrl={onBindPublishedUrl}
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
			<SelfMediaOpsReviewDashboard
				open={Boolean(activeOpsReviewTarget)}
				target={activeOpsReviewTarget}
				onClose={() => setActiveOpsReviewTarget(null)}
				onEditData={(target) => onOpenOpsMetrics?.(target)}
				onSyncData={onPostPublishRefresh}
				onLoadData={onLoadOpsReviewData}
			/>
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

function buildOpsArtifactStateSignature(
	statesByPostKey: Map<string, SelfMediaPostOpsArtifactStates>,
) {
	const keys: Array<keyof SelfMediaPostOpsArtifacts> = ["source", "metrics", "comments", "review"]
	return Array.from(statesByPostKey.entries())
		.map(([postKey, states]) =>
			[
				postKey,
				...keys.flatMap((key) => {
					const state = states[key]
					return [key, state.ready ? "1" : "0", state.fileId || "", state.version || ""]
				}),
			].join(":"),
		)
		.join("|")
}

export default observer(SelfMediaHomePage)
