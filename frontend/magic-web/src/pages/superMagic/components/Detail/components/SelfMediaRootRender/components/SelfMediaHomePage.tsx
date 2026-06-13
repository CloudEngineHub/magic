import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { useTranslation } from "react-i18next"
import { observer } from "mobx-react-lite"
import { cn } from "@/lib/utils"
import { ScrollArea } from "@/components/shadcn-ui/scroll-area"
import { useUserInfo } from "@/models/user/hooks/useUserInfo"
import type { ScheduledTask } from "@/types/scheduledTask"
import type { SelfMediaPlatform } from "../../../types"
import type { SelfMediaPlatformPostItem } from "../stores/SelfMediaStore"
import type { AICardCreateInitialValues } from "./AICardCreateDialog"
import type { SelfMediaAttachmentNode } from "../types"
import type { SelfMediaPostOpenTransitionPayload } from "./SelfMediaPostCard"
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
import SelfMediaOpsOverviewCard from "./SelfMediaOpsOverviewCard"
import {
	buildSelfMediaOpsOverview,
	getSelfMediaPostKey,
	type SelfMediaOpsOverviewAction,
} from "../services/selfMediaOpsOverview"
import SelfMediaHomeAICardList from "./SelfMediaHomeAICardList"
import SelfMediaHomeAnimations, {
	OPEN_POST_FALLBACK_TRANSITION_MS,
} from "./SelfMediaHomeAnimations"
import SelfMediaHomeEmptyState from "./SelfMediaHomeEmptyState"
import SelfMediaHomeHeader from "./SelfMediaHomeHeader"
import SelfMediaHomePostList from "./SelfMediaHomePostList"
import type {
	AICardFolderItem,
	SelfMediaHomeOpeningPost,
	SelfMediaHomePostGroup,
} from "./SelfMediaHomeTypes"

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
	onRenamePost?: (
		target: SelfMediaPlatformPostItem,
		nextTitle: string,
	) => Promise<boolean | void> | boolean | void
	onDeletePost?: (target: SelfMediaPlatformPostItem) => Promise<boolean | void> | boolean | void
	onOpenBrandConfig?: () => void
	onCreateAICard?: (initialValues?: AICardCreateInitialValues) => void
	onOpenAICardFolder?: (folder: AICardFolderItem) => void
	folderFileId?: string
	className?: string
}

interface ViewTransitionDocument extends Document {
	startViewTransition?: (callback: () => void) => {
		finished?: Promise<void>
		ready?: Promise<void>
		updateCallbackDone?: Promise<void>
	}
}

function prefersReducedMotion() {
	return (
		typeof window !== "undefined" &&
		typeof window.matchMedia === "function" &&
		window.matchMedia("(prefers-reduced-motion: reduce)").matches
	)
}

function getViewTransitionDocument() {
	if (typeof document === "undefined") return null
	const candidate = document as ViewTransitionDocument
	return typeof candidate.startViewTransition === "function" ? candidate : null
}

function getSelfMediaHomeDisplayName(
	userInfo: { nickname?: string | null; real_name?: string | null } | null,
) {
	return (userInfo?.nickname || userInfo?.real_name || "").trim()
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
	onRenamePost,
	onDeletePost,
	onOpenBrandConfig,
	onCreateAICard,
	onOpenAICardFolder,
	folderFileId,
	className,
}: SelfMediaHomePageProps) {
	const { t } = useTranslation("super")
	const { userInfo } = useUserInfo()
	const requestedPreviewPostKeysRef = useRef(new Set<string>())
	const requestedOpsMetricsPostKeysRef = useRef(new Set<string>())
	const currentOpsArtifactStatesRef = useRef(new Map<string, SelfMediaPostOpsArtifactStates>())
	const previousOpsArtifactStatesRef = useRef(new Map<string, SelfMediaPostOpsArtifactStates>())
	const openPostTransitionTimerRef = useRef<number | null>(null)
	const [activeOpsReviewTarget, setActiveOpsReviewTarget] =
		useState<SelfMediaPlatformPostItem | null>(null)
	const [openingPost, setOpeningPost] = useState<SelfMediaHomeOpeningPost | null>(null)
	const [opsMetricsByPostKey, setOpsMetricsByPostKey] = useState(
		() => new Map<string, SelfMediaPostOpsMetricsPayload | null>(),
	)
	const [opsArtifactAnimationsByPostKey, setOpsArtifactAnimationsByPostKey] = useState(
		() => new Map<string, ReturnType<typeof diffPostOpsArtifactAnimations>>(),
	)
	const hasPosts = posts.length > 0
	const postGroups = posts.reduce<SelfMediaHomePostGroup[]>((groups, item) => {
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
			getSelfMediaPostKey(item),
			buildPostOpsArtifactStates(item, attachmentList),
		)
	})
	currentOpsArtifactStatesRef.current = opsArtifactStatesByPostKey
	const opsArtifactStateSignature = buildOpsArtifactStateSignature(opsArtifactStatesByPostKey)
	const opsArtifactsByPostKey = new Map<string, SelfMediaPostOpsArtifacts>()
	opsArtifactStatesByPostKey.forEach((states, postKey) => {
		opsArtifactsByPostKey.set(postKey, getPostOpsArtifacts(states))
	})
	const opsOverview = buildSelfMediaOpsOverview({
		posts,
		artifactsByPostKey: opsArtifactsByPostKey,
		metricsByPostKey: opsMetricsByPostKey,
	})
	const postsByPostKey = useMemo(
		() => new Map(posts.map((item) => [getSelfMediaPostKey(item), item])),
		[posts],
	)
	const displayName = getSelfMediaHomeDisplayName(userInfo)
	const greetingTitle = displayName
		? `Hi，${displayName}，今天先看重点文章`
		: "Hi，今天先看重点文章"
	const greetingSubtitle = hasPosts
		? "按优先级推进发布、数据和复盘，先把今日重点往前推。"
		: t("detail.selfMedia.home.emptyDesc")

	const handleOpenPost = useCallback(
		(
			target: { platform: SelfMediaPlatform; index: number },
			transition?: SelfMediaPostOpenTransitionPayload,
		) => {
			if (!transition || prefersReducedMotion()) {
				onOpenPost(target)
				return
			}

			if (openPostTransitionTimerRef.current) {
				window.clearTimeout(openPostTransitionTimerRef.current)
			}

			const targetPost = posts.find(
				(item) => item.platform === target.platform && item.index === target.index,
			)
			const postKey = targetPost
				? getSelfMediaPostKey(targetPost)
				: `${target.platform}:${target.index}:${transition.postId}`
			const nextOpeningPost = {
				postKey,
				style: {
					"--open-card-lift": "-4px",
					"--open-card-scale": "0.996",
				} as CSSProperties,
			}
			const viewTransitionDocument = getViewTransitionDocument()
			if (viewTransitionDocument) {
				flushSync(() => {
					setOpeningPost(nextOpeningPost)
				})
				viewTransitionDocument.startViewTransition?.(() => {
					flushSync(() => {
						onOpenPost(target)
					})
				})
				return
			}

			setOpeningPost(nextOpeningPost)
			openPostTransitionTimerRef.current = window.setTimeout(() => {
				onOpenPost(target)
				setOpeningPost(null)
				openPostTransitionTimerRef.current = null
			}, OPEN_POST_FALLBACK_TRANSITION_MS)
		},
		[onOpenPost, posts],
	)

	const handleOpsOverviewAction = useCallback(
		(action: SelfMediaOpsOverviewAction) => {
			const target = postsByPostKey.get(action.postKey)
			if (!target) return
			if (action.key === "sync-metrics" || action.key === "collect-comments") {
				if (onPostPublishRefresh) {
					void Promise.resolve(onPostPublishRefresh(target))
					return
				}
			}
			if (action.key === "generate-review") {
				setActiveOpsReviewTarget(target)
				return
			}
			handleOpenPost({ platform: target.platform, index: target.index })
		},
		[handleOpenPost, onPostPublishRefresh, postsByPostKey],
	)

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
		return () => {
			if (openPostTransitionTimerRef.current) {
				window.clearTimeout(openPostTransitionTimerRef.current)
			}
		}
	}, [])

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
			const postKey = getSelfMediaPostKey(item)
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
				"self-media-home-stage relative flex h-full min-h-0 w-full flex-col",
				openingPost && "self-media-home-opening",
				className,
			)}
			style={{
				background:
					"linear-gradient(145deg, rgba(255, 255, 255, 0.52), transparent 40%), #f8f8f9",
			}}
			data-testid="self-media-home-page"
		>
			<SelfMediaHomeAnimations />
			<main className="min-h-0 flex-1" data-testid="self-media-home-main">
				<ScrollArea className="h-full">
					<div className="mx-auto max-w-5xl px-4 py-4 sm:px-6 sm:py-6">
						<SelfMediaHomeHeader
							greetingTitle={greetingTitle}
							greetingSubtitle={greetingSubtitle}
							opening={Boolean(openingPost)}
							onCreateArticle={onCreateArticle}
							onOpenBrandConfig={onOpenBrandConfig}
							onCreateAICard={onCreateAICard}
							t={t}
						/>
						{hasPosts ? (
							<section
								className={cn(
									"self-media-home-enter-item mb-8",
									openingPost && "self-media-home-opening-dim",
								)}
								style={{ animationDelay: "100ms" }}
							>
								<SelfMediaOpsOverviewCard
									overview={opsOverview}
									onAction={handleOpsOverviewAction}
								/>
							</section>
						) : (
							<SelfMediaHomeEmptyState onCreateArticle={onCreateArticle} t={t} />
						)}
						<SelfMediaHomeAICardList
							aiCardFolders={aiCardFolders}
							attachmentList={attachmentList}
							openingPost={openingPost}
							onOpenAICardFolder={onOpenAICardFolder}
							t={t}
						/>
						<SelfMediaHomePostList
							postGroups={postGroups}
							postCount={posts.length}
							attachmentList={attachmentList}
							openingPost={openingPost}
							opsArtifactsByPostKey={opsArtifactsByPostKey}
							opsMetricsByPostKey={opsMetricsByPostKey}
							opsArtifactAnimationsByPostKey={opsArtifactAnimationsByPostKey}
							onOpenPost={handleOpenPost}
							onRequestPrePublishAnalysis={onRequestPrePublishAnalysis}
							onPostPublishRefresh={onPostPublishRefresh}
							onConfigureAutoSync={onConfigureAutoSync}
							onOpenOpsReview={setActiveOpsReviewTarget}
							onLoadPublishedUrl={onLoadPublishedUrl}
							onLoadOpsSource={onLoadOpsSource}
							onBindPublishedUrl={onBindPublishedUrl}
							onRenamePost={onRenamePost}
							onDeletePost={onDeletePost}
							t={t}
						/>
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
