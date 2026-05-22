import { FileText, Layers, Plus, Settings } from "lucide-react"
import { useTranslation } from "react-i18next"
import { observer } from "mobx-react-lite"
import { cn } from "@/lib/utils"
import type { SelfMediaPlatform } from "../../../types"
import { ALL_PLATFORMS } from "./SelfMediaInitPanel/types"
import type { SelfMediaPlatformPostItem } from "../stores/SelfMediaStore"
import PlatformBrandIcon from "./PlatformBrandIcon"

interface SelfMediaHomePageProps {
	posts: SelfMediaPlatformPostItem[]
	onCreateArticle: () => void
	onOpenPost: (target: { platform: SelfMediaPlatform; index: number }) => void
	onOpenBrandConfig?: () => void
	className?: string
}

function SelfMediaHomePage({
	posts,
	onCreateArticle,
	onOpenPost,
	onOpenBrandConfig,
	className,
}: SelfMediaHomePageProps) {
	const { t } = useTranslation("super")
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

	const renderArticlePreview = ({ platform, post }: SelfMediaPlatformPostItem) => {
		const postId = post.meta.id || `${platform}-preview`
		const coverUrl =
			platform === "wechat-official-accounts"
				? post.thumbnailCover?.url || post.heroCover?.url
				: ""
		const cardUrl = platform !== "wechat-official-accounts" ? post.cards[0]?.url : ""

		if (coverUrl) {
			return (
				<img
					src={coverUrl}
					alt=""
					className="h-full w-full object-cover"
					data-testid={`self-media-home-cover-preview-${postId}`}
				/>
			)
		}

		if (cardUrl) {
			return (
				<iframe
					src={cardUrl}
					title={post.meta.title || post.meta.feedTitle || postId}
					tabIndex={-1}
					className="pointer-events-none h-[360px] w-[240px] origin-top-left scale-[0.17] border-0 bg-white"
					data-testid={`self-media-home-card-preview-${postId}`}
				/>
			)
		}

		return <FileText size={17} data-testid={`self-media-home-icon-fallback-${postId}`} />
	}

	return (
		<div
			className={cn("flex h-full min-h-0 w-full flex-col bg-background", className)}
			data-testid="self-media-home-page"
		>
			<header className="shrink-0 border-b border-border/60 bg-white px-6 py-5">
				<div className="mx-auto flex max-w-5xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
					<div className="space-y-1">
						<h2 className="text-2xl font-black tracking-tight text-foreground">
							{t("detail.selfMedia.home.title")}
						</h2>
						<p className="text-sm font-medium text-muted-foreground">
							{t("detail.selfMedia.home.subtitle")}
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						{onOpenBrandConfig ? (
							<button
								type="button"
								className="inline-flex cursor-pointer items-center justify-center gap-2 bg-zinc-100 px-4 py-2.5 text-xs font-black text-zinc-950 transition-all hover:bg-zinc-200 active:scale-[0.98]"
								onClick={onOpenBrandConfig}
								data-testid="self-media-home-brand-config-button"
							>
								<Settings size={14} />
								<span>{t("detail.selfMedia.home.brandConfig")}</span>
							</button>
						) : null}
						<button
							type="button"
							className="inline-flex cursor-pointer items-center justify-center gap-2 bg-zinc-950 px-4 py-2.5 text-xs font-black text-white transition-all hover:bg-zinc-900 active:scale-[0.98]"
							onClick={onCreateArticle}
							data-testid="self-media-home-create-button"
						>
							<Plus size={14} />
							<span>{t("detail.selfMedia.home.create")}</span>
						</button>
					</div>
				</div>
			</header>

			<main className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
				<div className="mx-auto max-w-5xl">
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
													t("detail.selfMedia.common.postFallbackTitle", {
														index: index + 1,
													})
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
															<div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden bg-primary/20 text-zinc-950">
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
			</main>
		</div>
	)
}

export default observer(SelfMediaHomePage)
