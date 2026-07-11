import { ImageIcon, Palette, X } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import { useLocaleText } from "@/pages/superMagic/components/MainInputContainer/panels/hooks/useLocaleText"
import type { OptionItem } from "@/pages/superMagic/components/MainInputContainer/panels/types"
import { getTemplateCoverUrl } from "./canvasInteraction"
import SlidesTemplateColorPalette from "./SlidesTemplateColorPalette"
import { applyResolvedTemplateColors, templateColorToRgba } from "./templateColors"
import { useResolvedTemplateColors } from "./useResolvedTemplateColors"

interface SlidesTemplateSelectionPreviewProps {
	onClear?: () => void
	onFindSimilarColors?: (template: OptionItem) => void
	onPreview?: () => void
	template: OptionItem
}

export default function SlidesTemplateSelectionPreview({
	onClear,
	onFindSimilarColors,
	onPreview,
	template,
}: SlidesTemplateSelectionPreviewProps) {
	const { t } = useTranslation("crew/create")
	const lt = useLocaleText()
	const templateName = lt(template.label) || lt(template.value) || String(template.value)
	const coverUrl = getTemplateCoverUrl(template)
	const colors = useResolvedTemplateColors({
		colors: template.colors,
		imageUrl: coverUrl,
		priority: "interactive",
	})
	const primaryAmbientColor = templateColorToRgba(colors[0], 0.16)

	return (
		<div
			className="flex min-w-0 items-center gap-3 border-b border-white/[0.08] bg-white/[0.035] px-3 py-3"
			style={
				primaryAmbientColor
					? {
							backgroundImage: `radial-gradient(circle at 18% 0%, ${primaryAmbientColor}, transparent 42%)`,
						}
					: undefined
			}
			data-testid="slides-templates-page-selected-template"
		>
			<button
				type="button"
				className="group flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left outline-none transition-colors hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-white/[0.32]"
				aria-label={t("playbook.edit.presets.form.preview")}
				onClick={onPreview}
				data-testid="slides-templates-page-preview-selected-template"
			>
				<div className="flex aspect-video w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/[0.08] ring-1 ring-inset ring-white/[0.12] transition-colors group-hover:ring-white/[0.24]">
					{coverUrl ? (
						<img
							src={coverUrl}
							alt={templateName}
							className="size-full object-contain"
							decoding="async"
							draggable={false}
							data-testid="slides-templates-page-selected-template-image"
						/>
					) : (
						<ImageIcon className="size-4 text-white/[0.40]" />
					)}
				</div>

				<div className="min-w-0 flex-1">
					<p className="truncate text-sm font-medium text-white/[0.92]">
						{t("playbook.edit.presets.form.selectedTemplate", {
							name: templateName,
						})}
					</p>
					<SlidesTemplateColorPalette className="mt-1.5" colors={colors} compact />
				</div>
			</button>

			{onFindSimilarColors && colors.length > 0 ? (
				<Button
					type="button"
					size="sm"
					variant="ghost"
					className="h-8 shrink-0 rounded-full px-2.5 text-xs text-white/[0.72] hover:bg-white/10 hover:text-white"
					onClick={() =>
						onFindSimilarColors(applyResolvedTemplateColors(template, colors))
					}
					data-testid="slides-templates-page-find-similar-colors"
				>
					<Palette className="mr-1 size-3.5" />
					{t("playbook.edit.presets.form.similarColors")}
				</Button>
			) : null}

			{onClear ? (
				<Button
					type="button"
					size="icon"
					variant="ghost"
					className="size-8 shrink-0 rounded-full text-white/[0.55] hover:bg-white/10 hover:text-white"
					aria-label={t("playbook.edit.presets.close")}
					onClick={onClear}
					data-testid="slides-templates-page-clear-selected-template"
				>
					<X className="size-4" />
				</Button>
			) : null}
		</div>
	)
}
