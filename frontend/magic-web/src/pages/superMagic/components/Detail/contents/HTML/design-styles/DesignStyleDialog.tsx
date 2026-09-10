import { useCallback, useEffect, useMemo, useRef, useLayoutEffect, useState } from "react"
import { AlertCircle, LoaderCircle, RefreshCw, Search, Sparkles } from "lucide-react"
import HeadlessHorizontalScroll from "@/components/base/HeadlessHorizontalScroll"
import { Button } from "@/components/shadcn-ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/shadcn-ui/dialog"
import { Input } from "@/components/shadcn-ui/input"
import { useTranslation } from "react-i18next"
import DesignStyleCard from "./DesignStyleCard"
import DesignStyleDetailHeader, { type DesignStyleDetailMode } from "./DesignStyleDetailHeader"
import DesignStylePreview from "./DesignStylePreview"
import {
	filterDesignStyles,
	getDesignStyleCategories,
	loadDesignStyleCatalog,
	resetDesignStyleCatalogCache,
	type DesignStyle,
} from "./catalog"
import DesignStyleCategoryLabel from "./categoryLabels"

interface DesignStyleDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	onApply: (style: DesignStyle) => void
	canApply: boolean
}

export default function DesignStyleDialog({
	open,
	onOpenChange,
	onApply,
	canApply,
}: DesignStyleDialogProps) {
	const { t } = useTranslation("super")
	const [query, setQuery] = useState("")
	const [category, setCategory] = useState("featured")
	const [selectedCode, setSelectedCode] = useState("")
	const [detailMode, setDetailMode] = useState<DesignStyleDetailMode>("details")
	const [styles, setStyles] = useState<DesignStyle[]>([])
	const [hasLoaded, setHasLoaded] = useState(false)
	const [isLoading, setIsLoading] = useState(false)
	const [loadError, setLoadError] = useState<Error | null>(null)
	const galleryRef = useRef<HTMLDivElement>(null)
	const backRef = useRef<HTMLButtonElement>(null)
	const selectedCardRef = useRef<HTMLButtonElement | null>(null)
	const scrollTopRef = useRef(0)

	const returnToGallery = useCallback(() => setSelectedCode(""), [])
	useLayoutEffect(() => {
		if (selectedCode) {
			backRef.current?.focus()
		} else if (open) {
			// Keep the gallery mounted so returning restores both its position and keyboard focus.
			if (galleryRef.current) galleryRef.current.scrollTop = scrollTopRef.current
			selectedCardRef.current?.focus({ preventScroll: true })
		}
	}, [open, selectedCode])

	const loadCatalog = useCallback(async () => {
		setIsLoading(true)
		setLoadError(null)
		try {
			const catalog = await loadDesignStyleCatalog()
			setStyles(catalog.styles)
			setHasLoaded(true)
		} catch (error) {
			setLoadError(error instanceof Error ? error : new Error(String(error)))
		} finally {
			setIsLoading(false)
		}
	}, [])

	useEffect(() => {
		if (open && !hasLoaded && !isLoading && !loadError) void loadCatalog()
	}, [hasLoaded, isLoading, loadCatalog, loadError, open])

	useEffect(() => {
		if (!open) setSelectedCode("")
	}, [open])

	const designStyleCategories = useMemo(() => getDesignStyleCategories(styles), [styles])
	const filteredStyles = useMemo(
		() => filterDesignStyles(styles, query, category),
		[category, query, styles],
	)
	const selectedStyle = styles.find((style) => style.code === selectedCode)

	const handleRetry = useCallback(() => {
		resetDesignStyleCatalogCache()
		void loadCatalog()
	}, [loadCatalog])

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="flex h-[min(820px,calc(100vh-2rem))] w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1120px]"
				onEscapeKeyDown={(event) => {
					if (selectedStyle) {
						event.preventDefault()
						returnToGallery()
					}
				}}
				data-testid="design-style-dialog"
			>
				<DialogHeader className="border-b border-border/70 px-5 py-4 pr-12 text-left">
					{selectedStyle ? (
						<DesignStyleDetailHeader
							style={selectedStyle}
							mode={detailMode}
							onModeChange={setDetailMode}
							onBack={returnToGallery}
							backButtonRef={backRef}
						/>
					) : (
						<>
							<DialogTitle className="flex items-center gap-2 text-base">
								<span className="flex size-7 items-center justify-center rounded-lg bg-primary/[0.1] text-primary">
									<Sparkles className="size-4" aria-hidden="true" />
								</span>
								{t("htmlEditor.designStyle.title")}
							</DialogTitle>
							<DialogDescription className="mt-1 max-w-[70ch] text-xs leading-5">
								{t("htmlEditor.designStyle.description")}
							</DialogDescription>
						</>
					)}
				</DialogHeader>

				{isLoading ? (
					<div
						className="flex min-h-80 flex-1 flex-col items-center justify-center gap-3 text-sm text-muted-foreground"
						data-testid="design-style-loading"
					>
						<LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
						<span>{t("htmlEditor.designStyle.loading")}</span>
					</div>
				) : loadError ? (
					<div
						className="flex min-h-80 flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted-foreground"
						data-testid="design-style-error"
					>
						<AlertCircle className="size-5 text-destructive" aria-hidden="true" />
						<p>{t("htmlEditor.designStyle.loadError")}</p>
						<Button variant="outline" size="sm" onClick={handleRetry}>
							<RefreshCw className="mr-1.5 size-4" aria-hidden="true" />
							{t("htmlEditor.designStyle.retry")}
						</Button>
					</div>
				) : (
					<div className="flex min-h-0 min-w-0 flex-1 flex-col">
						<section
							className={
								selectedStyle ? "hidden" : "flex min-h-0 min-w-0 flex-1 flex-col"
							}
							aria-label={t("htmlEditor.designStyle.libraryLabel")}
						>
							<div className="space-y-3 px-4 py-4">
								<div className="relative">
									<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
									<Input
										value={query}
										onChange={(event) => {
											setQuery(event.target.value)
											if (galleryRef.current) galleryRef.current.scrollTop = 0
										}}
										placeholder={t("htmlEditor.designStyle.searchPlaceholder")}
										className="h-9 pl-9 text-sm"
										aria-label={t("htmlEditor.designStyle.searchPlaceholder")}
									/>
								</div>
								<HeadlessHorizontalScroll
									className="w-full"
									scrollContainerClassName="flex w-full min-w-0 touch-pan-x gap-1.5 overflow-x-auto pb-1 pr-16"
									scrollContainerProps={{
										role: "group",
										"aria-label": t("htmlEditor.designStyle.categoryLabel"),
									}}
									scrollStep={240}
								>
									{[...designStyleCategories]
										.sort(
											(a, b) =>
												Number(b.code === "featured") -
												Number(a.code === "featured"),
										)
										.map((item) => (
											<button
												key={item.code}
												type="button"
												aria-pressed={category === item.code}
												className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] transition-[color,background-color,border-color] ${
													category === item.code
														? "border-primary bg-primary text-primary-foreground"
														: "border-border bg-background text-muted-foreground hover:border-foreground/25 hover:text-foreground"
												}`}
												onClick={(event) => {
													setCategory(item.code)
													if (galleryRef.current)
														galleryRef.current.scrollTop = 0
													event.currentTarget.scrollIntoView({
														behavior: "smooth",
														block: "nearest",
														inline: "center",
													})
												}}
											>
												<DesignStyleCategoryLabel category={item.code} />
												<span className="ml-1.5 opacity-70">
													{
														filterDesignStyles(styles, "", item.code)
															.length
													}
												</span>
											</button>
										))}
								</HeadlessHorizontalScroll>
								<div className="text-[11px] text-muted-foreground">
									{t("htmlEditor.designStyle.resultCount", {
										count: filteredStyles.length,
									})}
								</div>
							</div>
							<div
								ref={galleryRef}
								data-testid="design-style-gallery"
								className="min-h-0 flex-1 overflow-y-auto px-4 pb-4"
							>
								{filteredStyles.length > 0 ? (
									<div
										className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2 lg:grid-cols-4"
										data-testid="design-style-grid"
									>
										{filteredStyles.map((style) => (
											<DesignStyleCard
												key={style.code}
												style={style}
												onSelect={(event) => {
													scrollTopRef.current =
														galleryRef.current?.scrollTop ?? 0
													selectedCardRef.current = event.currentTarget
													setDetailMode("details")
													setSelectedCode(style.code)
												}}
											/>
										))}
									</div>
								) : (
									<div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border px-5 text-center text-xs leading-5 text-muted-foreground">
										{t("htmlEditor.designStyle.empty")}
										<Button
											variant="outline"
											onClick={() => {
												setQuery("")
												setCategory("all")
											}}
										>
											{t("htmlEditor.designStyle.gallery.clearFilters")}
										</Button>
									</div>
								)}
							</div>
						</section>

						{selectedStyle && (
							<section className="flex min-h-0 flex-1 flex-col">
								{/* The scrollport has no top padding so sticky section headers can reach its visible edge. */}
								<div
									className="min-h-0 flex-1 overflow-y-auto bg-muted/20 px-4 pb-4 sm:px-6 sm:pb-6"
									data-testid="design-style-detail-scroll"
								>
									<DesignStylePreview
										key={selectedStyle.code}
										style={selectedStyle}
										mode={detailMode}
									/>
								</div>
							</section>
						)}
					</div>
				)}

				{selectedStyle && (
					<DialogFooter className="border-t border-border/70 bg-background px-5 py-3">
						<p className="mr-auto self-center text-xs text-muted-foreground">
							{t("htmlEditor.designStyle.gallery.applyHint")}
						</p>
						<Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
							{t("htmlEditor.designStyle.cancel")}
						</Button>
						<Button
							size="sm"
							disabled={
								!selectedStyle || !canApply || isLoading || Boolean(loadError)
							}
							onClick={() => selectedStyle && onApply(selectedStyle)}
							data-testid="design-style-apply-button"
						>
							{t("htmlEditor.designStyle.apply")}
						</Button>
					</DialogFooter>
				)}
			</DialogContent>
		</Dialog>
	)
}
