import { useEffect, useMemo, useState } from "react"
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
import HeadlessHorizontalScroll from "@/components/base/HeadlessHorizontalScroll"
import type { OptionItem } from "../types"
import { useLocaleText } from "../hooks/useLocaleText"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useCenteredHorizontalScroll } from "../../hooks/useCenteredHorizontalScroll"

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
	const [activeIndex, setActiveIndex] = useState(0)
	const title = lt(template?.preview_title) ?? lt(template?.label) ?? lt(template?.value) ?? ""
	const description = lt(template?.preview_description) ?? lt(template?.description)
	const canSwitch = pages.length > 1
	const { scrollContainerRef, setItemRef } = useCenteredHorizontalScroll({
		activeKey: String(activeIndex),
		itemCount: pages.length,
	})

	useEffect(() => {
		setActiveIndex(0)
	}, [template])

	useEffect(() => {
		if (!open || !pages.length || typeof window === "undefined") return

		const preloadImages = pages.map((page) => {
			const image = new window.Image()
			image.decoding = "async"
			image.src = page
			return image
		})

		return () => {
			preloadImages.forEach((image) => {
				image.onload = null
				image.onerror = null
			})
		}
	}, [open, pages])

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
				{pages.length ? (
					<div className="flex min-h-0 flex-col gap-3 overflow-hidden px-5 sm:px-7">
						<div
							className="relative mx-auto aspect-video w-[min(100%,calc(clamp(280px,52vh,680px)*16/9))] shrink-0 overflow-hidden rounded-md border border-border/60 bg-white shadow-sm"
							data-testid="slides-preset-preview-dialog-pages"
						>
							<img
								src={pages[activeIndex]}
								alt={`${title} ${activeIndex + 1}`}
								className="size-full object-contain"
								loading="eager"
								decoding="async"
							/>
							<div
								className="absolute bottom-3 right-3 rounded-full bg-black/70 px-3 py-1 text-sm font-medium text-white shadow-sm"
								data-testid="slides-preset-preview-dialog-page-index"
							>
								{activeIndex + 1} / {pages.length}
							</div>
						</div>
						{canSwitch ? (
							<HeadlessHorizontalScroll
								className="shrink-0 overflow-visible rounded-none"
								controlBackground="#ffffff"
								scrollContainerRef={scrollContainerRef}
								scrollContainerClassName="flex gap-3 p-1"
								scrollStep={220}
								renderLeftControl={({ scroll }) => (
									<div className="pointer-events-none absolute left-0 top-0 z-10 flex h-full w-10 items-center justify-start">
										<Button
											type="button"
											variant="secondary"
											size="icon"
											className="pointer-events-auto ml-1 size-8 rounded-full border border-border/70 bg-white text-neutral-900 shadow-md hover:bg-white"
											onClick={() => scroll("left")}
										>
											<ChevronLeft className="size-4" />
										</Button>
									</div>
								)}
								renderRightControl={({ scroll }) => (
									<div className="pointer-events-none absolute right-0 top-0 z-10 flex h-full w-10 items-center justify-end">
										<Button
											type="button"
											variant="secondary"
											size="icon"
											className="pointer-events-auto mr-1 size-8 rounded-full border border-border/70 bg-white text-neutral-900 shadow-md hover:bg-white"
											onClick={() => scroll("right")}
										>
											<ChevronRight className="size-4" />
										</Button>
									</div>
								)}
							>
								{pages.map((page, index) => (
									<div
										key={`${page}-${index}`}
										ref={(element) => setItemRef(String(index), element)}
										className="shrink-0"
									>
										<button
											type="button"
											aria-label={`${title} ${index + 1}`}
											onClick={() => setActiveIndex(index)}
											className={cn(
												"relative aspect-video w-[132px] overflow-hidden rounded-md border bg-white shadow-sm transition sm:w-[184px] xl:w-[220px]",
												activeIndex === index
													? "border-neutral-950 ring-2 ring-neutral-950"
													: "border-border/60 hover:border-primary/50",
											)}
										>
											<img
												src={page}
												alt=""
												className="size-full object-cover"
												loading="eager"
												decoding="async"
												draggable={false}
												aria-hidden="true"
											/>
											<span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/70 px-2 py-0.5 text-xs font-medium text-white">
												#{index + 1}
											</span>
										</button>
									</div>
								))}
							</HeadlessHorizontalScroll>
						) : null}
					</div>
				) : previewUrl ? (
					<div className="min-h-0 px-5 sm:px-7">
						<iframe
							data-testid="slides-preset-preview-dialog-iframe"
							title={title}
							src={previewUrl}
							className="size-full rounded-md border border-border/60 bg-white shadow-sm"
							referrerPolicy="no-referrer"
							sandbox="allow-forms allow-popups allow-same-origin allow-scripts"
							allowFullScreen
						/>
					</div>
				) : null}
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
