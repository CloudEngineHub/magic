import { useTranslation } from "react-i18next"
import { Label } from "@/components/shadcn-ui/label"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/shadcn-ui/select"
import type { SelfMediaPost } from "../types"

interface ExportPostSelectorProps {
	posts: SelfMediaPost[]
	selectedPostIndex: number
	onChange: (value: string) => void
	disabled: boolean
}

export default function ExportPostSelector({
	posts,
	selectedPostIndex,
	onChange,
	disabled,
}: ExportPostSelectorProps) {
	const { t } = useTranslation("super")

	return (
		<div className="flex shrink-0 flex-col gap-2 px-4 pt-4 sm:px-6">
			<Label className="text-xs font-medium text-muted-foreground">
				{t("detail.selfMedia.export.postSelectorLabel")}
			</Label>
			<Select
				value={String(selectedPostIndex)}
				onValueChange={onChange}
				disabled={disabled || posts.length === 0}
			>
				<SelectTrigger className="h-9" data-testid="self-media-export-post-selector">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{posts.map((post, index) => (
						<SelectItem
							key={post.meta.id || index}
							value={String(index)}
							data-testid={`self-media-export-post-option-${index}`}
						>
							{post.meta.title ||
								post.meta.feedTitle ||
								t("detail.selfMedia.common.postFallbackTitle", {
									index: index + 1,
								})}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	)
}
