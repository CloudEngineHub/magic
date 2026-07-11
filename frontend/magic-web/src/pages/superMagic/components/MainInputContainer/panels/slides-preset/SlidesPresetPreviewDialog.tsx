import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/shadcn-ui/dialog"
import { Button } from "@/components/shadcn-ui/button"
import type { OptionItem } from "../types"
import { useLocaleText } from "../hooks/useLocaleText"
import { X } from "lucide-react"
import SlidesPresetPreviewPages from "./SlidesPresetPreviewPages"

interface SlidesPresetPreviewDialogProps {
	template: OptionItem | null
	open: boolean
	onOpenChange: (open: boolean) => void
	onSelect?: (template: OptionItem) => void
}

function SlidesPresetPreviewDialog({
	template,
	open,
	onOpenChange,
	onSelect,
}: SlidesPresetPreviewDialogProps) {
	const lt = useLocaleText()
	const { t } = useTranslation("crew/create")

	const previewUrl = template?.preview_url
	const pages = useMemo(() => {
		const previewImages = template?.preview_image_urls?.filter(Boolean) ?? []
		if (previewImages.length) return previewImages
		return template?.collage_url ? [template.collage_url] : []
	}, [template])
	const title = lt(template?.preview_title) ?? lt(template?.label) ?? lt(template?.value) ?? ""
	const description = lt(template?.preview_description) ?? lt(template?.description)

	function handleSelect() {
		if (!template) return
		onSelect?.(template)
		onOpenChange(false)
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				data-testid="slides-preset-preview-dialog-content"
				className="max-h-[92vh] !max-w-[min(84vw,1440px)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-2xl border-0 bg-white p-0 shadow-2xl"
				showCloseButton={false}
			>
				<DialogHeader className="flex-row items-start justify-between gap-4 space-y-0 px-5 pb-2 pt-4 sm:px-7 sm:pt-5">
					<div className="min-w-0 flex-1">
						<DialogTitle className="truncate text-lg font-semibold leading-7 text-neutral-900">
							{title}
						</DialogTitle>
						<DialogDescription className="sr-only">
							{description ?? title}
						</DialogDescription>
					</div>
					<button
						type="button"
						aria-label="Close"
						onClick={() => onOpenChange(false)}
						className="mt-0.5 rounded-sm p-1 text-neutral-500 transition-colors hover:text-neutral-900 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
						data-testid="on-open-change"
					>
						<X className="size-6" />
					</button>
				</DialogHeader>
				<SlidesPresetPreviewPages
					keyboardEnabled={open}
					onEscape={() => onOpenChange(false)}
					pages={pages}
					previewUrl={previewUrl}
					title={title}
					resetKey={template ? `${lt(template.value) ?? ""}:${open}` : String(open)}
					className="px-5 sm:px-7"
				/>
				<DialogFooter className="flex-row justify-end gap-3 px-5 pb-5 pt-4 sm:px-7 sm:pb-6">
					<Button
						type="button"
						variant="outline"
						className="h-11 min-w-28 rounded-lg bg-white px-6 text-base font-semibold text-neutral-900 shadow-sm"
						onClick={() => onOpenChange(false)}
					>
						{t("playbook.edit.presets.form.cancel")}
					</Button>
					<Button
						type="button"
						className="h-11 min-w-36 rounded-lg bg-neutral-950 px-6 text-base font-semibold text-white hover:bg-neutral-800"
						data-testid="slides-preset-preview-dialog-use-button"
						onClick={handleSelect}
					>
						{t("playbook.edit.presets.form.useTemplate")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

export default SlidesPresetPreviewDialog
