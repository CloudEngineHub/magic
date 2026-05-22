import { FileText, Layers, Plus, Sparkles } from "lucide-react"
import { useTranslation } from "react-i18next"
import { observer } from "mobx-react-lite"
import { cn } from "@/lib/utils"
import type { SelfMediaPlatform } from "../../../types"
import type { SelfMediaPost } from "../types"
import PlatformSwitcher from "./PlatformSwitcher"
import PlatformBrandIcon from "./PlatformBrandIcon"

interface SelfMediaHomePageProps {
	posts: SelfMediaPost[]
	platforms: SelfMediaPlatform[]
	activePlatform: SelfMediaPlatform | null
	onCreateArticle: () => void
	onOpenPost: (index: number) => void
	onChangePlatform: (platform: SelfMediaPlatform) => void
	className?: string
}

function SelfMediaHomePage({
	posts,
	platforms,
	activePlatform,
	onCreateArticle,
	onOpenPost,
	onChangePlatform,
	className,
}: SelfMediaHomePageProps) {
	const { t } = useTranslation("super")
	const hasPosts = posts.length > 0

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
						{platforms.length > 1 && activePlatform ? (
							<PlatformSwitcher
								platforms={platforms}
								activePlatform={activePlatform}
								onChange={onChangePlatform}
							/>
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
							<div className="grid gap-3 md:grid-cols-2">
								{posts.map((post, index) => {
									const postId = post.meta.id || `post-${index}`
									const title =
										post.meta.feedTitle ||
										post.meta.title ||
										t("detail.selfMedia.common.postFallbackTitle", {
											index: index + 1,
										})
									const subtitle = post.meta.subtitle || post.meta.author || ""

									return (
										<button
											key={postId}
											type="button"
											className="group flex min-h-28 cursor-pointer flex-col gap-3 border-l-2 border-transparent bg-white p-4 text-left transition-all hover:border-zinc-950 hover:bg-zinc-50/70 active:scale-[0.99]"
											onClick={() => onOpenPost(index)}
											data-testid={`self-media-home-post-open-${postId}`}
										>
											<div className="flex items-start gap-3">
												<div className="flex h-10 w-10 shrink-0 items-center justify-center bg-primary/20 text-zinc-950">
													<FileText size={17} />
												</div>
												<div className="min-w-0 flex-1 space-y-1">
													<div className="flex items-center gap-2">
														{activePlatform ? (
															<PlatformBrandIcon
																platform={activePlatform}
																className="size-3.5 shrink-0"
															/>
														) : null}
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
