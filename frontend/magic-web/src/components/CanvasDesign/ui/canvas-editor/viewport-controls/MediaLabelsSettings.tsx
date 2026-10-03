import { Settings2 } from "lucide-react"
import { useCanvasDesignI18n } from "../../../app/providers/I18nProvider"
import { Button } from "../../primitives/shadcn/button"
import { Checkbox } from "../../primitives/shadcn/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "../../primitives/shadcn/popover"
import { useCachedMediaLabelsAlwaysVisible } from "./useCachedMediaLabelsAlwaysVisible"

export default function MediaLabelsSettings() {
	const { t } = useCanvasDesignI18n()
	const { mediaLabelsAlwaysVisible, setMediaLabelsAlwaysVisible } =
		useCachedMediaLabelsAlwaysVisible()
	const settingsLabel = t("zoom.settings", "画布设置")
	const mediaLabelsLabel = t("zoom.alwaysShowMediaLabels", "常驻显示媒体标题和分辨率")

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="size-[34px] shrink-0 rounded-full border border-border bg-[var(--base-popover,#fff)] shadow-sm hover:bg-accent"
					aria-label={settingsLabel}
				>
					<Settings2 size={16} />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-auto min-w-[240px] p-3">
				<label className="flex cursor-pointer items-start gap-2 text-sm">
					<Checkbox
						checked={mediaLabelsAlwaysVisible}
						onCheckedChange={(checked) => setMediaLabelsAlwaysVisible(checked === true)}
						aria-label={mediaLabelsLabel}
					/>
					<span className="leading-5">{mediaLabelsLabel}</span>
				</label>
			</PopoverContent>
		</Popover>
	)
}
