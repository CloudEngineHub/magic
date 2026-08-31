import { observer } from "mobx-react-lite"
import type { ReactNode } from "react"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Separator } from "@/components/shadcn-ui/separator"
import { Button } from "@/components/shadcn-ui/button"
import { Textarea } from "@/components/shadcn-ui/textarea"
import { TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/shadcn-ui/tooltip"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import { cn } from "@/utils/cn"
import { LayoutPanelTop, Paintbrush, PanelRight, ScanEye, RectangleHorizontal } from "lucide-react"
import { useSelectedElement } from "./hooks/useSelectedElement"
import { useStylePanelStore } from "../../iframe-bridge/contexts/StylePanelContext"
import { TAILWIND_Z_INDEX_CLASSES } from "../../constants/z-index"
import type { ContextToolbarItemMotion, StylePanelProps } from "./types"
import LayoutSection from "./sections/LayoutSection"
import FlexGridSection from "./sections/FlexGridSection"
import ImageSection from "./sections/ImageSection"
import BackgroundSection from "./sections/BackgroundSection"
import BorderSection from "./sections/BorderSection"
import ShadowSection from "./sections/ShadowSection"
import {
	HistoryActions,
	FontFamilySelector,
	FontSizeSelector,
	FontSizeAdjuster,
	TextFormatTools,
	TextAlignTools,
	ColorPicker,
	StylePopoverButton,
	ElementActions,
	SizePopover,
	ContextMorePopover,
} from "./controls"
import { useShowButtonText } from "@/hooks/useShowButtonText"
import { getElementCapabilities } from "./capabilities"

const CONTEXT_TOOLBAR_STAGGER_MS = 16

// The floating panel mounts before its open frame is requested. Drive the child
// state explicitly so the staggered transition also runs for the first render.
function ContextToolbarMotion({
	children,
	enabled,
	open = true,
	as = "div",
}: {
	children: ReactNode
	enabled: boolean
	open?: boolean
	as?: "div" | "span"
}) {
	const motionRef = useRef<HTMLElement | null>(null)
	const [isEntered, setIsEntered] = useState(false)

	useLayoutEffect(() => {
		if (!enabled || !motionRef.current) return

		const panel = motionRef.current.closest<HTMLElement>("[data-html-context-panel]")
		if (!panel) return

		const items = Array.from(
			panel.querySelectorAll<HTMLElement>("[data-context-toolbar-motion-item]"),
		)
		const itemIndex = items.indexOf(motionRef.current)
		if (itemIndex >= 0) {
			motionRef.current.style.setProperty(
				"--context-toolbar-delay",
				`${itemIndex * CONTEXT_TOOLBAR_STAGGER_MS}ms`,
			)
		}
	})

	useEffect(() => {
		if (!enabled || !open) {
			setIsEntered(false)
			return
		}

		const frame = window.requestAnimationFrame(() => setIsEntered(true))
		return () => window.cancelAnimationFrame(frame)
	}, [enabled, open])

	if (!enabled) return <>{children}</>
	const MotionTag = as

	return (
		<MotionTag
			ref={motionRef}
			data-context-toolbar-motion-item="true"
			className={cn(
				"transition-[opacity,transform] ease-out will-change-[opacity,transform] [transition-duration:160ms] motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none",
				as === "span" && "inline-flex",
				open && isEntered
					? "translate-y-0 opacity-100 [transition-delay:var(--context-toolbar-delay)]"
					: "translate-y-2 opacity-0 [transition-delay:0ms]",
			)}
		>
			{children}
		</MotionTag>
	)
}

/**
 * Rich text editor style toolbar component
 * Provides visual style editing interface similar to rich text editors
 */
export const StylePanel = observer(function StylePanel({
	editorRef,
	onStyleChange,
	disabled = false,
	className,
	toolbarEndRef,
	variant = "full",
	domTreeOpen = false,
	onToggleDomTree,
	contextToolbarOpen = true,
}: StylePanelProps) {
	const { t } = useTranslation("super")
	const { selectedElement, updateStyle, updateBatchStyles, updateAttributes } =
		useSelectedElement(editorRef)
	const stylePanelStore = useStylePanelStore()

	// Local state for quick access
	const [fontSize, setFontSize] = useState("16")
	const [fontFamily, setFontFamily] = useState("sans-serif")
	const [textContent, setTextContent] = useState("")

	const showButtonLabel = useShowButtonText(800)

	// In a flex context, alignment is controlled by the flex container's
	// justify-content rather than the selected text element's text-align.
	const computedStyles =
		selectedElement?.computedStyles ||
		(stylePanelStore.selectedElements.length > 0
			? stylePanelStore.selectedElements[0]?.computedStyles
			: undefined)
	const isFlexContainer = computedStyles?.display === "flex"
	const isFlexItem = computedStyles?.parentDisplay === "flex"
	const flexAlignment = useMemo(() => {
		if (stylePanelStore.textSelection?.hasSelection || !selectedElement) return null

		if (isFlexContainer) {
			return {
				value: computedStyles?.justifyContent || "flex-start",
				direction: computedStyles?.flexDirection || "row",
				targetSelector: selectedElement.selector,
			}
		}

		if (isFlexItem && computedStyles?.parentSelector) {
			return {
				value: computedStyles.parentJustifyContent || "flex-start",
				direction: computedStyles.parentFlexDirection || "row",
				targetSelector: computedStyles.parentSelector,
			}
		}

		return null
	}, [
		computedStyles,
		isFlexContainer,
		isFlexItem,
		selectedElement,
		stylePanelStore.textSelection?.hasSelection,
	])

	/**
	 * Sync local state with selected element styles
	 * Handles both single and multi-select mode
	 * Shows actual DOM font size (not scaled by zoom)
	 */
	useEffect(() => {
		// Update local state from selected element (single-select only)
		// In multi-select mode, we show mixed/default values
		if (selectedElement?.computedStyles) {
			setTextContent(selectedElement.textContent ?? "")
			const { fontSize: computedFontSize, fontFamily: computedFontFamily } =
				selectedElement.computedStyles

			// Extract font size number from "16px" format
			// Show actual DOM size (element's true font-size property)
			if (computedFontSize) {
				const sizeMatch = computedFontSize.match(/(\d+)/)
				if (sizeMatch) {
					const actualSize = Number.parseInt(sizeMatch[1], 10)
					setFontSize(actualSize.toString())
				}
			}

			// Extract first font family from comma-separated list
			if (computedFontFamily) {
				const firstFont = computedFontFamily.split(",")[0].trim().replace(/['"]/g, "")
				setFontFamily(firstFont)
			}
		} else if (stylePanelStore.selectedElements.length > 0) {
			setTextContent("")
			// Multi-select mode: use first element's styles as default
			const firstElement = stylePanelStore.selectedElements[0]
			if (firstElement?.computedStyles) {
				const { fontSize: computedFontSize, fontFamily: computedFontFamily } =
					firstElement.computedStyles

				if (computedFontSize) {
					const sizeMatch = computedFontSize.match(/(\d+)/)
					if (sizeMatch) {
						const actualSize = Number.parseInt(sizeMatch[1], 10)
						setFontSize(actualSize.toString())
					}
				}

				if (computedFontFamily) {
					const firstFont = computedFontFamily.split(",")[0].trim().replace(/['"]/g, "")
					setFontFamily(firstFont)
				}
			}
		} else {
			setTextContent("")
		}
	}, [selectedElement, stylePanelStore, stylePanelStore.selectedElements])

	const handleTextContentCommit = useCallback(
		async (value: string) => {
			if (
				!selectedElement?.isTextElement ||
				!selectedElement.selector ||
				!editorRef.current?.updateTextContent
			)
				return

			const nextContent = value.replace(/\r\n/g, "\n")
			if (nextContent === (selectedElement.textContent ?? "")) return

			await editorRef.current.updateTextContent(selectedElement.selector, nextContent)
			stylePanelStore.selectElement({
				...selectedElement,
				textContent: nextContent,
			})
		},
		[editorRef, selectedElement, stylePanelStore],
	)

	/**
	 * Handle style change
	 * Supports both single and multiple element selection
	 */
	const handleStyleChange = useCallback(
		async (property: string, value: string) => {
			// Get all selected selectors (handles both single and multi-select)
			const selectors = stylePanelStore.getSelectedSelectors()
			if (selectors.length === 0) {
				console.warn("[StylePanel] No elements selected")
				return
			}

			// Apply the style change (handles both single and multi-select)
			await updateStyle(property, value)

			// Notify callback with primary selector
			const primarySelector = selectors[0]
			onStyleChange?.(primarySelector, property, value)

			// For text selection changes, TextStyleManager will automatically select
			// the newly created/modified span, so we should NOT refresh the old element
			// selector here as it would override the automatic span selection
		},
		[updateStyle, onStyleChange, stylePanelStore],
	)

	/**
	 * Handle text formatting
	 */
	const handleFormat = useCallback(
		(property: string, value: string) => {
			handleStyleChange(property, value)
		},
		[handleStyleChange],
	)

	/**
	 * Handle font family change
	 */
	const handleFontFamilyChange = useCallback(
		(value: string) => {
			setFontFamily(value)
			handleStyleChange("fontFamily", value)
		},
		[handleStyleChange],
	)

	/**
	 * Handle font size apply
	 * Applies the actual DOM font size directly
	 */
	const handleFontSizeApply = useCallback(
		(value: string) => {
			// Apply the actual font size directly (no scaling conversion)
			const fontSize = Number.parseInt(value, 10)
			handleStyleChange("fontSize", `${fontSize}px`)
		},
		[handleStyleChange],
	)

	/**
	 * Handle text align
	 */
	const handleAlign = useCallback(
		(value: string) => {
			handleStyleChange("textAlign", value)
		},
		[handleStyleChange],
	)

	const handleAlignment = useCallback(
		async (value: string) => {
			if (!flexAlignment) {
				handleAlign(value)
				return
			}

			if (!editorRef.current) return

			await editorRef.current.setBatchStyles(flexAlignment.targetSelector, {
				justifyContent: value,
			})
			onStyleChange?.(flexAlignment.targetSelector, "justifyContent", value)

			// Refresh the selected element so parentJustifyContent reflects the new
			// value when the selected node is a flex item.
			if (selectedElement?.selector) {
				await editorRef.current.refreshSelectedElement(selectedElement.selector)
			}
		},
		[editorRef, flexAlignment, handleAlign, onStyleChange, selectedElement?.selector],
	)

	/**
	 * Handle linked size updates so image ratio locking can commit width/height together.
	 */
	const handleBatchStyleChange = useCallback(
		async (styles: Record<string, string>) => {
			await updateBatchStyles(styles)

			const selectors = stylePanelStore.getSelectedSelectors()
			const primarySelector = selectors[0]
			if (!primarySelector) return

			Object.entries(styles).forEach(([property, value]) => {
				onStyleChange?.(primarySelector, property, value)
			})
		},
		[onStyleChange, stylePanelStore, updateBatchStyles],
	)

	/**
	 * Handle font size adjustment for selected element(s) and their children
	 * Adjusts font size relatively by a scale factor (10%)
	 * Uses dedicated command to ensure atomic undo/redo
	 * Supports both single and multi-select
	 */
	const handleFontSizeAdjust = useCallback(
		async (direction: "increase" | "decrease") => {
			// Get all selected selectors (handles both single and multi-select)
			const selectors = stylePanelStore.getSelectedSelectors()
			if (selectors.length === 0 || !editorRef?.current) {
				console.warn("[StylePanel] No elements selected for font size adjustment")
				return
			}

			try {
				// Scale factor for font size adjustment (10% increase/decrease)
				const scaleFactor = direction === "increase" ? 1.1 : 0.9
				// Minimum font size in actual DOM pixels
				const minFontSize = 8

				// Use the new recursive font size adjustment command for each selected element
				// This ensures all changes are recorded as a single atomic operation for each element
				for (const selector of selectors) {
					await editorRef.current.adjustFontSizeRecursive?.(
						selector,
						scaleFactor,
						minFontSize,
					)
				}

				// Update local state with computed font size after adjustment
				// Use first selector as representative
				const iframe = editorRef.current as { iframeRef?: { current?: HTMLIFrameElement } }
				const iframeWindow = iframe.iframeRef?.current?.contentWindow

				if (iframeWindow?.document) {
					const element = iframeWindow.document.querySelector(selectors[0])
					if (element && "style" in element) {
						const computedStyle = iframeWindow.getComputedStyle(element)
						const actualFontSize = Number.parseFloat(computedStyle.fontSize)
						if (!Number.isNaN(actualFontSize)) {
							// Show actual DOM font size (not scaled)
							setFontSize(Math.round(actualFontSize).toString())
						}
					}
				}
			} catch (error) {
				console.error("[StylePanel] Failed to adjust font size:", error)
			}
		},
		[stylePanelStore, editorRef],
	)

	const isBold = !!(computedStyles?.fontWeight && parseInt(computedStyles.fontWeight) >= 700)
	const isItalic = computedStyles?.fontStyle === "italic"
	const hasUnderline = computedStyles?.textDecoration?.includes("underline") ?? false
	const hasLineThrough = computedStyles?.textDecoration?.includes("line-through") ?? false
	const textAlign = computedStyles?.textAlign || "left"
	const currentColor = computedStyles?.color || "#000000"
	const capabilities = getElementCapabilities(selectedElement)
	const showAlignmentTools = capabilities.showParagraph || Boolean(flexAlignment)

	// Disable controls when no element is selected or when saving
	// Check both single and multi-select modes
	const hasSelection = selectedElement !== null || stylePanelStore.selectedElements.length > 0
	const isDisabled = !hasSelection || disabled
	const showGlobal = variant !== "context"
	const showElementControls = variant !== "global"
	const contextClassName =
		variant === "context"
			? "w-max min-w-full flex-nowrap gap-1 overflow-visible border-0 bg-transparent px-0 py-0"
			: ""
	const toolbarSeparatorClassName = variant === "context" ? "mx-1 !h-4 bg-border/70" : "mx-1 !h-4"
	const textContentField = capabilities.showTypography ? (
		<div className="w-full min-w-0 basis-full">
			<label className="mb-2 block text-xs font-medium text-muted-foreground">
				<span className="mb-1 block">{t("stylePanel.textContent")}</span>
				<Textarea
					value={textContent}
					onChange={(event) => setTextContent(event.target.value)}
					onBlur={(event) => handleTextContentCommit(event.target.value)}
					placeholder={t("stylePanel.textContentPlaceholder")}
					rows={4}
					maxLength={5000}
					disabled={isDisabled}
					className="min-h-24 resize-y rounded-md px-2 py-1.5 text-sm"
				/>
			</label>
		</div>
	) : null
	const contextMorePopover = (
		<ContextMorePopover
			selectedElement={selectedElement}
			editorRef={editorRef}
			disabled={isDisabled}
			showTypography={capabilities.showTypography}
			showFlexGrid={capabilities.showFlexGrid}
			showImage={capabilities.showImage}
			showBackground={capabilities.showBackground}
			isLink={capabilities.isLink}
			fontFamilySelector={
				<FontFamilySelector
					value={fontFamily}
					onChange={handleFontFamilyChange}
					disabled={isDisabled}
				/>
			}
			textContentField={textContentField}
			onStyleChange={handleStyleChange}
			onBatchStyleChange={handleBatchStyleChange}
			onUpdateAttributes={updateAttributes}
		/>
	)
	const renderContextToolbarItem = useCallback<ContextToolbarItemMotion>(
		(children) => (
			<ContextToolbarMotion
				as="span"
				enabled={variant === "context"}
				open={contextToolbarOpen}
			>
				{children}
			</ContextToolbarMotion>
		),
		[contextToolbarOpen, variant],
	)

	return (
		<TooltipProvider delayDuration={300}>
			<div
				className={cn(
					variant === "context"
						? "px-0 py-0"
						: "border-b bg-card/95 px-2 py-1.5 backdrop-blur supports-[backdrop-filter]:bg-card/60",
					contextClassName,
					toolbarEndRef
						? "flex w-full min-w-0 items-center gap-2"
						: variant === "context"
							? "flex min-w-0 flex-nowrap items-center gap-1"
							: "flex flex-wrap items-center gap-1",
					className,
				)}
			>
				<div
					className={cn(
						"flex min-w-0 items-center gap-1",
						variant === "context"
							? "flex-nowrap"
							: toolbarEndRef
								? "min-w-0 flex-1 flex-wrap"
								: "flex-wrap",
					)}
				>
					{showGlobal ? <HistoryActions editorRef={editorRef} /> : null}
					{showGlobal && showElementControls ? (
						<Separator orientation="vertical" className={toolbarSeparatorClassName} />
					) : null}

					{showElementControls ? (
						<>
							{/* Element actions (duplicate, delete) */}
							<ElementActions
								editorRef={editorRef}
								disabled={disabled}
								itemMotion={
									variant === "context" ? renderContextToolbarItem : undefined
								}
							/>
							<Separator
								orientation="vertical"
								className={toolbarSeparatorClassName}
							/>

							{capabilities.showTypography ? (
								<>
									{variant !== "context" ? textContentField : null}
									{variant !== "context" ? (
										<FontFamilySelector
											value={fontFamily}
											onChange={handleFontFamilyChange}
											disabled={isDisabled}
										/>
									) : null}
									{capabilities.showFontSize
										? renderContextToolbarItem(
												<FontSizeSelector
													value={fontSize}
													onChange={setFontSize}
													onApply={handleFontSizeApply}
													disabled={isDisabled}
													className={
														variant === "context"
															? "w-20 shrink-0"
															: undefined
													}
												/>,
											)
										: null}
								</>
							) : null}

							{capabilities.showFontSizeAdjuster ? (
								<FontSizeAdjuster
									onAdjust={handleFontSizeAdjust}
									disabled={isDisabled}
									itemMotion={
										variant === "context" ? renderContextToolbarItem : undefined
									}
								/>
							) : null}

							{variant !== "context" ||
							capabilities.showTypography ||
							capabilities.showFontSizeAdjuster ? (
								<Separator
									orientation="vertical"
									className={toolbarSeparatorClassName}
								/>
							) : null}

							{capabilities.showTypography ? (
								<TextFormatTools
									isBold={isBold}
									isItalic={isItalic}
									hasUnderline={hasUnderline}
									hasLineThrough={hasLineThrough}
									onFormat={handleFormat}
									disabled={isDisabled}
									itemMotion={
										variant === "context" ? renderContextToolbarItem : undefined
									}
								/>
							) : null}

							{variant !== "context" || capabilities.showTypography ? (
								<Separator
									orientation="vertical"
									className={toolbarSeparatorClassName}
								/>
							) : null}

							{showAlignmentTools ? (
								<TextAlignTools
									value={flexAlignment?.value || textAlign}
									onAlign={handleAlignment}
									mode={flexAlignment ? "flex" : "text"}
									flexDirection={flexAlignment?.direction}
									disabled={isDisabled}
									compact={variant === "context"}
									itemMotion={
										variant === "context" ? renderContextToolbarItem : undefined
									}
								/>
							) : null}

							{variant !== "context" || showAlignmentTools ? (
								<Separator
									orientation="vertical"
									className={toolbarSeparatorClassName}
								/>
							) : null}

							{capabilities.showTypography
								? renderContextToolbarItem(
										<ColorPicker
											value={currentColor}
											onChangeComplete={(value) =>
												handleStyleChange("color", value)
											}
											disabled={isDisabled}
										/>,
									)
								: null}

							{variant !== "context" || capabilities.showTypography ? (
								<Separator
									orientation="vertical"
									className={toolbarSeparatorClassName}
								/>
							) : null}

							{variant !== "context" ? (
								<>
									{/* Size settings stay in the full toolbar; contextual actions use More Styles. */}
									<SizePopover
										selectedElement={selectedElement}
										disabled={isDisabled}
										showLabel={showButtonLabel}
										onStyleChange={(property, value) =>
											handleStyleChange(property, value)
										}
										onBatchStyleChange={handleBatchStyleChange}
									/>

									<Separator
										orientation="vertical"
										className={toolbarSeparatorClassName}
									/>
								</>
							) : null}

							{variant === "context" ? (
								renderContextToolbarItem(contextMorePopover)
							) : (
								<>
									{/* Layout settings */}
									<StylePopoverButton
										icon={<LayoutPanelTop className="h-4 w-4" />}
										tooltip={t("stylePanel.layoutSettings")}
										title={t("stylePanel.layout")}
										disabled={isDisabled}
										showLabel={variant === "context" ? true : showButtonLabel}
									>
										<LayoutSection
											selectedElement={selectedElement}
											editorRef={editorRef}
											onStyleChange={handleStyleChange}
										/>
									</StylePopoverButton>
									{capabilities.showFlexGrid ? (
										<StylePopoverButton
											icon={<LayoutPanelTop className="h-4 w-4" />}
											tooltip={t("stylePanel.flexGridLayout")}
											title={t("stylePanel.flexGrid")}
											disabled={isDisabled}
											showLabel={
												variant === "context" ? true : showButtonLabel
											}
										>
											<FlexGridSection
												selectedElement={selectedElement}
												editorRef={editorRef}
												onStyleChange={handleStyleChange}
											/>
										</StylePopoverButton>
									) : null}
									{capabilities.showImage ? (
										<StylePopoverButton
											icon={<Paintbrush className="h-4 w-4" />}
											tooltip={t("stylePanel.imageSettings")}
											title={t("stylePanel.imageSettings")}
											disabled={isDisabled}
											showLabel={
												variant === "context" ? true : showButtonLabel
											}
										>
											<ImageSection
												selectedElement={selectedElement}
												editorRef={editorRef}
												onStyleChange={handleStyleChange}
											/>
										</StylePopoverButton>
									) : null}
									{capabilities.showBackground ? (
										<StylePopoverButton
											icon={<Paintbrush className="h-4 w-4" />}
											tooltip={t("stylePanel.backgroundSettings")}
											title={t("stylePanel.background")}
											disabled={isDisabled}
											showLabel={
												variant === "context" ? true : showButtonLabel
											}
										>
											<BackgroundSection
												selectedElement={selectedElement}
												editorRef={editorRef}
												onStyleChange={handleStyleChange}
											/>
										</StylePopoverButton>
									) : null}
									<StylePopoverButton
										icon={<RectangleHorizontal className="h-4 w-4" />}
										tooltip={t("stylePanel.borderSettings")}
										title={t("stylePanel.border")}
										disabled={isDisabled}
										showLabel={variant === "context" ? true : showButtonLabel}
									>
										<BorderSection
											selectedElement={selectedElement}
											editorRef={editorRef}
											onStyleChange={handleStyleChange}
										/>
									</StylePopoverButton>
									<StylePopoverButton
										icon={<ScanEye className="h-4 w-4" />}
										tooltip={t("stylePanel.shadowAndEffects")}
										title={t("stylePanel.shadow")}
										disabled={isDisabled}
										showLabel={variant === "context" ? true : showButtonLabel}
									>
										<ShadowSection
											selectedElement={selectedElement}
											editorRef={editorRef}
											onStyleChange={handleStyleChange}
										/>
									</StylePopoverButton>
								</>
							)}
						</>
					) : null}
				</div>

				{showGlobal && onToggleDomTree ? (
					<TooltipPrimitive.Root>
						<TooltipTrigger asChild>
							<Button
								variant={domTreeOpen ? "secondary" : "ghost"}
								size="sm"
								className={cn(
									"h-8 shrink-0 gap-1 px-2",
									toolbarEndRef ? "ml-1" : "ml-auto",
								)}
								onClick={onToggleDomTree}
								aria-label={t(
									domTreeOpen
										? "stylePanel.domTree.collapsePageStructure"
										: "stylePanel.domTree.expandPageStructure",
								)}
							>
								<PanelRight className="h-4 w-4" />
								<span>
									{t(
										domTreeOpen
											? "stylePanel.domTree.collapsePageStructure"
											: "stylePanel.domTree.expandPageStructure",
									)}
								</span>
							</Button>
						</TooltipTrigger>
						<TooltipContent
							className={TAILWIND_Z_INDEX_CLASSES.EDITOR_FLOATING.TOOLTIP}
						>
							{t(
								domTreeOpen
									? "stylePanel.domTree.collapsePageStructure"
									: "stylePanel.domTree.expandPageStructure",
							)}
						</TooltipContent>
					</TooltipPrimitive.Root>
				) : null}
				{showGlobal && toolbarEndRef ? (
					<div
						ref={toolbarEndRef}
						className="ml-1 flex shrink-0 items-center"
						data-testid="html-style-panel-toolbar-end"
					/>
				) : null}
			</div>
		</TooltipProvider>
	)
})

StylePanel.displayName = "StylePanel"
