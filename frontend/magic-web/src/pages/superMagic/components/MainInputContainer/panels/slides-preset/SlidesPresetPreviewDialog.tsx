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
import MagicPopup from "@/components/base-mobile/MagicPopup"
import { useIsMobile } from "@/hooks/useIsMobile"
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
	const isMobile = useIsMobile()

	const previewUrl = template?.preview_url
	const pages = useMemo(() => {
		const previewImages = template?.preview_image_urls?.filter(Boolean) ?? []
		if (previewImages.length) return previewImages
		return [template?.collage_url, template?.thumbnail_url].filter((url): url is string =>
			Boolean(url),
		)
	}, [template?.collage_url, template?.preview_image_urls, template?.thumbnail_url])
	const title = lt(template?.preview_title) ?? lt(template?.label) ?? lt(template?.value) ?? ""
	const description = lt(template?.preview_description) ?? lt(template?.description)

	function handleSelect() {
		if (!template) return
		onSelect?.(template)
		onOpenChange(false)
	}

	function renderPreviewPages(className: string, iframeClassName?: string) {
		return (
			<SlidesPresetPreviewPages
				className={className}
				iframeClassName={iframeClassName}
				keyboardEnabled={open}
				onEscape={() => onOpenChange(false)}
				pages={pages}
				previewUrl={previewUrl}
				title={title}
				resetKey={template ? `${lt(template.value) ?? ""}:${open}` : String(open)}
			/>
		)
	}

	if (isMobile) {
		return (
			<MagicPopup
				visible={open}
				onClose={() => onOpenChange(false)}
				position="bottom"
				title={title}
				headerVariant="actionHeader"
				headerTitle={title}
				headerLeadingAction={{
					ariaLabel: "Close",
					icon: <X />,
					onClick: () => onOpenChange(false),
					testId: "on-open-change",
				}}
				className="!max-h-[calc(100dvh-var(--safe-area-inset-top)-0.5rem)] overflow-hidden rounded-t-2xl border-0 bg-white p-0 data-[vaul-drawer-direction=bottom]:!mt-[max(0.5rem,var(--safe-area-inset-top))]"
				bodyClassName="flex min-h-0 flex-col !overflow-y-auto"
			>
				<div
					data-testid="slides-preset-preview-dialog-content"
					className="flex min-h-0 flex-col bg-white"
				>
					{renderPreviewPages("px-4", "min-h-[52dvh]")}
					<div className="sticky bottom-0 flex shrink-0 gap-3 bg-white px-4 pb-4 pt-3">
						<Button
							type="button"
							variant="outline"
							className="h-11 flex-1 rounded-lg bg-white px-4 text-base font-semibold text-neutral-900 shadow-sm"
							onClick={() => onOpenChange(false)}
						>
							{t("playbook.edit.presets.form.cancel")}
						</Button>
						<Button
							type="button"
							className="h-11 flex-[1.3] rounded-lg bg-neutral-950 px-4 text-base font-semibold text-white hover:bg-neutral-800"
							data-testid="slides-preset-preview-dialog-use-button"
							onClick={handleSelect}
						>
							{t("playbook.edit.presets.form.useTemplate")}
						</Button>
					</div>
				</div>
			</MagicPopup>
		)
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
				{renderPreviewPages("px-5 sm:px-7")}
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
