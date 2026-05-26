import { useEffect, useMemo, useRef } from "react"
import { FileText, Layers, Plus, Settings, Sparkles } from "lucide-react"
import { useTranslation } from "react-i18next"
import { observer } from "mobx-react-lite"
import { cn } from "@/lib/utils"
import { MagicTooltip } from "@/components/base"
import { ScrollArea } from "@/components/shadcn-ui/scroll-area"
import type { SelfMediaPlatform } from "../../../types"
import { ALL_PLATFORMS } from "./SelfMediaInitPanel/types"
import type { SelfMediaPlatformPostItem } from "../stores/SelfMediaStore"
import PlatformBrandIcon from "./PlatformBrandIcon"
import CardFrame from "./CardFrame"
import { CARD_THUMBNAIL_IMAGE_PROCESS } from "../constants/imageProcess"
import { useCoverImageUrl } from "../platforms/wechat-official-accounts/useCoverImageUrl"
import { isCardPlatform } from "../services/selfMediaAiNormalize"
import type { SelfMediaAttachmentNode, SelfMediaCard } from "../types"

interface AICardFolderItem {
	file_id: string
	file_name?: string
	is_directory?: boolean
	children?: any[]
	display_config?: any
}

interface SelfMediaHomePageProps {
	posts: SelfMediaPlatformPostItem[]
	attachmentList?: SelfMediaAttachmentNode[]
	onEnsurePostLoaded?: (target: { platform: SelfMediaPlatform; index: number }) => void
	onCreateArticle?: () => void
	onOpenPost: (target: { platform: SelfMediaPlatform; index: number }) => void
	onOpenBrandConfig?: () => void
	onCreateAICard?: () => void
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

	const getPlatformLabel = (platform: SelfMediaPlatform) => {
		const platformConfig = ALL_PLATFORMS.find((item) => item.value === platform)
		return platformConfig ? t(platformConfig.labelKey) : platform
	}

	// Find sibling AI card folders from the attachment tree
	const aiCardFolders = useMemo(() => {
		if (!attachmentList?.length || !folderFileId) return []
		// Find the parent that contains our self-media folder
		const findParentChildren = (
			nodes: SelfMediaAttachmentNode[],
		): SelfMediaAttachmentNode[] | null => {
			for (const node of nodes) {
				if (node.file_id === folderFileId) return nodes
				if (node.is_directory && node.children?.length) {
					const result = findParentChildren(node.children as SelfMediaAttachmentNode[])
					if (result) return result
				}
			}
			return null
		}
		const siblings = findParentChildren(attachmentList) || attachmentList
		return siblings.filter(
			(node) =>
				node.is_directory &&
				node.file_id !== folderFileId &&
				(node as any).display_config?.type === "ai-card",
		) as unknown as AICardFolderItem[]
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

	const renderArticlePreview = ({ platform, post }: SelfMediaPlatformPostItem) => {
		const postId = post.meta.id || `${platform}-preview`
		const cover =
			platform === "wechat-official-accounts"
				? post.thumbnailCover || post.heroCover
				: undefined
		const card = platform !== "wechat-official-accounts" ? post.cards[0] : undefined

		if (cover?.fileId || cover?.url) return <HomeCoverPreview cover={cover} postId={postId} />

		if (card?.fileId)
			return (
				<div
					className="pointer-events-none h-full w-full bg-white"
					data-testid={`self-media-home-card-preview-${postId}`}
				>
					<CardFrame
						cardId={`home-${postId}-${card.version ?? ""}`}
						fileId={card.fileId}
						version={card.version}
						attachmentList={attachmentList}
						imageProcessOptions={CARD_THUMBNAIL_IMAGE_PROCESS}
						className="h-full w-full"
						title={post.meta.title || post.meta.feedTitle || postId}
					/>
				</div>
			)

		return <FileText size={17} data-testid={`self-media-home-icon-fallback-${postId}`} />
	}

	return (
		<div
			className={cn("flex h-full min-h-0 w-full flex-col bg-background", className)}
			data-testid="self-media-home-page"
		>
			<header className="shrink-0 border-b border-border/60 bg-white px-6 py-5">
				<div className="mx-auto flex max-w-5xl [container-type:inline-size] flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
					<div className="space-y-1">
						<h2 className="text-2xl font-black tracking-tight text-foreground">
							{t("detail.selfMedia.home.title")}
						</h2>
						<p className="text-sm font-medium text-muted-foreground">
							{t("detail.selfMedia.home.subtitle")}
						</p>
					</div>
					<div className="flex flex-nowrap items-center gap-2">
						{onOpenBrandConfig ? (
							<MagicTooltip title={t("detail.selfMedia.home.brandConfig")}>
								<button
									type="button"
									className="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap bg-zinc-100 px-2.5 py-2.5 text-xs font-black text-zinc-950 transition-all hover:bg-zinc-200 active:scale-[0.98] [@container(min-width:600px)]:px-4"
									onClick={onOpenBrandConfig}
									data-testid="self-media-home-brand-config-button"
								>
									<Settings size={14} className="shrink-0" />
									<span className="hidden [@container(min-width:600px)]:inline">
										{t("detail.selfMedia.home.brandConfig")}
									</span>
								</button>
							</MagicTooltip>
						) : null}
						{onCreateAICard ? (
							<MagicTooltip title={t("detail.selfMedia.home.aiCard")}>
								<button
									type="button"
									className="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap bg-violet-50 px-2.5 py-2.5 text-xs font-black text-violet-700 transition-all hover:bg-violet-100 active:scale-[0.98] [@container(min-width:600px)]:px-4"
									onClick={onCreateAICard}
									data-testid="self-media-home-ai-card-button"
								>
									<Sparkles size={14} className="shrink-0" />
									<span className="hidden [@container(min-width:600px)]:inline">
										{t("detail.selfMedia.home.aiCard")}
									</span>
								</button>
							</MagicTooltip>
						) : null}
						{onCreateArticle ? (
							<MagicTooltip title={t("detail.selfMedia.home.create")}>
								<button
									type="button"
									className="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap bg-zinc-950 px-2.5 py-2.5 text-xs font-black text-white transition-all hover:bg-zinc-900 active:scale-[0.98] [@container(min-width:600px)]:px-4"
									onClick={onCreateArticle}
									data-testid="self-media-home-create-button"
								>
									<Plus size={14} className="shrink-0" />
									<span className="hidden [@container(min-width:600px)]:inline">
										{t("detail.selfMedia.home.create")}
									</span>
								</button>
							</MagicTooltip>
						) : null}
					</div>
				</div>
			</header>

			<main className="min-h-0 flex-1">
				<ScrollArea className="h-full">
					<div className="mx-auto max-w-5xl px-6 py-6">
						{aiCardFolders.length > 0 && onOpenAICardFolder ? (
							<section
								className="mb-6 space-y-4"
								data-testid="self-media-home-ai-card-list"
							>
								<div className="flex items-center justify-between border-b border-dashed border-zinc-950/10 pb-3">
									<div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-zinc-950">
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
											(child: any) =>
												child.file_name === "latest.html" &&
												!child.is_directory,
										)
										return (
											<button
												key={folder.file_id}
												type="button"
												className="group flex min-h-28 cursor-pointer flex-col gap-3 border-l-2 border-transparent bg-white p-4 text-left transition-all hover:border-violet-600 hover:bg-violet-50/50 active:scale-[0.99]"
												onClick={() => onOpenAICardFolder(folder)}
												data-testid={`self-media-home-ai-card-open-${folder.file_id}`}
											>
												<div className="flex items-start gap-3">
													<div className="flex h-[4.5rem] w-[3.375rem] shrink-0 items-center justify-center overflow-hidden bg-violet-100 text-violet-700">
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
														<h3 className="truncate text-sm font-black text-zinc-950 group-hover:text-violet-700">
															{name}
														</h3>
														<p className="text-xs font-medium text-muted-foreground">
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
								<div className="flex items-center justify-between border-b border-dashed border-zinc-950/10 pb-3">
									<div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-zinc-950">
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
												<h3 className="text-sm font-black text-zinc-950">
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

													return (
														<button
															key={`${platform}-${postId}`}
															type="button"
															className="group flex min-h-28 cursor-pointer flex-col gap-3 border-l-2 border-transparent bg-white p-4 text-left transition-all hover:border-zinc-950 hover:bg-zinc-50/70 active:scale-[0.99]"
															onClick={() =>
																onOpenPost({ platform, index })
															}
															data-testid={`self-media-home-post-open-${postId}`}
														>
															<div className="flex items-start gap-3">
																<div
																	className={cn(
																		"flex shrink-0 items-center justify-center overflow-hidden bg-primary/20 text-zinc-950",
																		isCardPlatform(platform)
																			? "h-[4.5rem] w-[3.375rem]"
																			: "h-14 w-14",
																	)}
																>
																	{renderArticlePreview(item)}
																</div>
																<div className="min-w-0 flex-1 space-y-1">
																	<div className="flex items-center gap-2">
																		{/* <PlatformBrandIcon
																		platform={platform}
																		className="size-3.5 shrink-0"
																	/> */}
																		<h3 className="truncate text-sm font-black text-zinc-950 group-hover:text-primary">
																			{title}
																		</h3>
																	</div>
																	{subtitle ? (
																		<p className="line-clamp-2 text-xs font-medium leading-relaxed text-muted-foreground">
																			{subtitle}
																		</p>
																	) : null}
																</div>
															</div>
														</button>
													)
												})}
											</div>
										</section>
									))}
								</div>
							</section>
						) : (
							<section
								className="flex min-h-[22rem] flex-col items-center justify-center gap-4 border border-dashed border-zinc-950/15 bg-white px-6 py-10 text-center"
								data-testid="self-media-home-empty"
							>
								<div className="flex h-14 w-14 items-center justify-center bg-primary/20 text-zinc-950">
									<FileText size={24} />
								</div>
								<div className="space-y-1">
									<h3 className="text-lg font-black text-foreground">
										{t("detail.selfMedia.home.emptyTitle")}
									</h3>
									<p className="text-sm font-medium text-muted-foreground">
										{t("detail.selfMedia.home.emptyDesc")}
									</p>
								</div>
								<button
									type="button"
									className="inline-flex cursor-pointer items-center justify-center gap-2 bg-zinc-950 px-4 py-2.5 text-xs font-black text-white transition-all hover:bg-zinc-900 active:scale-[0.98]"
									onClick={onCreateArticle}
									data-testid="self-media-home-empty-create-button"
								>
									<Plus size={14} />
									<span>{t("detail.selfMedia.home.create")}</span>
								</button>
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

function HomeCoverPreview({ cover, postId }: { cover: SelfMediaCard; postId: string }) {
	const { url } = useCoverImageUrl(
		cover.url ? undefined : cover.fileId,
		Boolean(cover.fileId && !cover.url),
		CARD_THUMBNAIL_IMAGE_PROCESS,
	)
	const coverUrl = cover.url || url

	if (!coverUrl)
		return <FileText size={17} data-testid={`self-media-home-icon-fallback-${postId}`} />

	return (
		<img
			src={coverUrl}
			alt=""
			className="h-full w-full object-cover"
			data-testid={`self-media-home-cover-preview-${postId}`}
		/>
	)
}

export default observer(SelfMediaHomePage)
