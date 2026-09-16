import { useCallback, useEffect, useMemo, useRef, useLayoutEffect, useState } from "react"
import { AlertCircle, LoaderCircle, RefreshCw, Search, X } from "lucide-react"
import { Button } from "@/components/shadcn-ui/button"
import {
	Dialog,
	DialogContent,
	DialogClose,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/shadcn-ui/dialog"
import {
	Select,
	SelectTrigger,
	SelectValue,
	SelectContent,
	SelectItem,
} from "@/components/shadcn-ui/select"
import { ScrollArea } from "@/components/shadcn-ui/scroll-area"
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
	const detailRef = useRef<HTMLDivElement>(null)
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
				showCloseButton={false}
				className="flex h-[min(820px,calc(100vh-2rem))] w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1080px]"
				onEscapeKeyDown={(event) => {
					if (selectedStyle) {
						event.preventDefault()
						returnToGallery()
					}
				}}
				data-testid="design-style-dialog"
			>
				<DialogHeader className="flex-row items-center gap-4 space-y-0 border-b border-border/70 px-6 py-3 text-left">
					<div className="min-w-0 flex-1">
						{selectedStyle ? (
							<DesignStyleDetailHeader
								style={selectedStyle}
								mode={detailMode}
								onModeChange={(mode) => {
									setDetailMode(mode)
									if (detailRef.current) detailRef.current.scrollTop = 0
								}}
								onBack={returnToGallery}
								backButtonRef={backRef}
							/>
						) : (
							<>
								<DialogTitle className="flex items-center gap-2 text-xl">
									{t("htmlEditor.designStyle.title")}
								</DialogTitle>
								<DialogDescription className="mt-1 max-w-[70ch] text-xs leading-5">
									{t("htmlEditor.designStyle.description")}
								</DialogDescription>
							</>
						)}
					</div>
					<DialogClose asChild>
						<Button
							variant="ghost"
							size="icon"
							className="size-8 shrink-0 text-muted-foreground"
							aria-label={t("common.close")}
						>
							<X className="size-4" aria-hidden="true" />
						</Button>
					</DialogClose>
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
							<div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border/60 px-6 py-3">
								<div className="relative order-3 w-full lg:ml-auto lg:w-60">
									<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
									<Input
										value={query}
										onChange={(event) => {
											setQuery(event.target.value)
											if (galleryRef.current) galleryRef.current.scrollTop = 0
										}}
										placeholder={t("htmlEditor.designStyle.searchPlaceholder")}
										className="h-9 border-0 bg-muted/40 pl-9 text-sm shadow-none"
										aria-label={t("htmlEditor.designStyle.searchPlaceholder")}
									/>
								</div>
								<div
									className="order-1 flex flex-wrap items-center gap-x-5 gap-y-2"
									role="group"
									aria-label={t("htmlEditor.designStyle.categoryLabel")}
								>
									{["featured", "all"].map((code) => (
										<button
											key={code}
											type="button"
											aria-pressed={category === code}
											className={`min-h-9 border-b-2 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring ${category === code ? "border-foreground font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
											onClick={() => {
												setCategory(code)
												if (galleryRef.current)
													galleryRef.current.scrollTop = 0
											}}
										>
											<DesignStyleCategoryLabel category={code} />
										</button>
									))}
									<Select
										value={
											["featured", "all"].includes(category) ? "" : category
										}
										onValueChange={(value) => {
											setCategory(value)
											if (galleryRef.current) galleryRef.current.scrollTop = 0
										}}
									>
										<SelectTrigger
											size="sm"
											aria-label={t("htmlEditor.designStyle.categoryLabel")}
											className="max-w-48 text-xs shadow-none"
										>
											<SelectValue
												placeholder={t(
													"htmlEditor.designStyle.browseCategories",
												)}
											/>
										</SelectTrigger>
										<SelectContent>
											{designStyleCategories
												.filter(
													(item) =>
														!["featured", "all"].includes(item.code),
												)
												.map((item) => (
													<SelectItem key={item.code} value={item.code}>
														<DesignStyleCategoryLabel
															category={item.code}
														/>
													</SelectItem>
												))}
										</SelectContent>
									</Select>
								</div>
								<div className="order-2 whitespace-nowrap text-xs text-muted-foreground">
									{t("htmlEditor.designStyle.resultCount", {
										count: filteredStyles.length,
									})}
								</div>
							</div>
							<ScrollArea
								viewportRef={galleryRef}
								viewportProps={{ "data-testid": "design-style-gallery" }}
								className="min-h-0 flex-1 overflow-hidden"
								viewportClassName="px-6 pb-6 [&>div]:!block"
							>
								{filteredStyles.length > 0 ? (
									<div
										className="grid grid-cols-1 gap-x-6 gap-y-7 pt-5 sm:grid-cols-2 lg:grid-cols-3"
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
							</ScrollArea>
						</section>

						{selectedStyle && (
							<section className="flex min-h-0 flex-1 flex-col">
								{/* Keep viewport refs for scroll restoration; block content prevents Radix table sizing from widening the dialog. */}
								<ScrollArea
									className="min-h-0 flex-1 overflow-hidden bg-background"
									viewportRef={detailRef}
									viewportProps={{ "data-testid": "design-style-detail-scroll" }}
									viewportClassName="px-4 pb-4 sm:px-6 sm:pb-6 [&>div]:!block"
								>
									<DesignStylePreview
										key={selectedStyle.code}
										style={selectedStyle}
										mode={detailMode}
									/>
								</ScrollArea>
							</section>
						)}
					</div>
				)}

				{selectedStyle && (
					<DialogFooter className="border-t border-border/70 bg-background px-6 py-2.5">
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
