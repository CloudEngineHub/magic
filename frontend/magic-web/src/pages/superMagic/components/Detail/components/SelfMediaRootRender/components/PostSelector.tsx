import { memo } from "react"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/shadcn-ui/select"
import { cn } from "@/lib/utils"
import { useTranslation } from "react-i18next"
import type { SelfMediaPost } from "../types"

interface PostSelectorProps {
	posts: SelfMediaPost[]
	activeIndex: number
	onChange: (index: number) => void
	className?: string
}

/** Compact post switcher used in toolbars. */
function PostSelector({ posts, activeIndex, onChange, className }: PostSelectorProps) {
	const { t } = useTranslation("super")

	if (!posts.length) return null

	return (
		<div
			className={cn("flex min-w-0 items-center gap-2", className)}
			data-testid="self-media-post-selector"
		>
			<span className="bg-primary/20 px-2 py-0.5 text-[10px] font-black text-zinc-950">
				{t("detail.selfMedia.postSelector.label")}
			</span>
			<div className="min-w-0 max-w-full flex-1">
				<Select value={String(activeIndex)} onValueChange={(v) => onChange(Number(v))}>
					<SelectTrigger
						size="sm"
						className="h-8 w-fit min-w-0 max-w-full border-0 border-b border-zinc-200 bg-zinc-50/40 text-xs shadow-none focus:border-zinc-950 focus:bg-primary/[0.03]"
					>
						<span
							className="min-w-0 max-w-full flex-1 truncate text-left"
							data-testid="self-media-post-selector-value"
						>
							<SelectValue />
						</span>
					</SelectTrigger>
					<SelectContent>
						{posts.map((post, idx) => {
							const label =
								post.meta.feedTitle ||
								post.meta.title ||
								t("detail.selfMedia.common.postFallbackTitle", { index: idx + 1 })
							return (
								<SelectItem
									key={post.meta.id || idx}
									value={String(idx)}
									data-testid={`self-media-post-${idx}`}
								>
									<span className="block">{label}</span>
								</SelectItem>
							)
						})}
					</SelectContent>
				</Select>
			</div>
		</div>
	)
}

export default memo(PostSelector)
