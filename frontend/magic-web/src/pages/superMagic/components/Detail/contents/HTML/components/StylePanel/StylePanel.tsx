import { observer } from "mobx-react-lite"
import { useCallback, useEffect, useState } from "react"
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
import type { StylePanelProps } from "./types"
import LayoutSection from "./sections/LayoutSection"
import BoxModelSection from "./sections/BoxModelSection"
import FlexGridSection from "./sections/FlexGridSection"
import ImageSection from "./sections/ImageSection"
import { AnchorSection } from "./sections/AnchorSection"
import BackgroundSection from "./sections/BackgroundSection"
import BorderSection from "./sections/BorderSection"
import ShadowSection from "./sections/ShadowSection"
import { CustomCSSSection } from "./sections/CustomCSSSection"
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
} from "./controls"
import { useShowButtonText } from "@/hooks/useShowButtonText"
import { STYLE_PANEL_STYLES } from "./styles"
import { getElementCapabilities } from "./capabilities"

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

	// Get current computed styles
	// In multi-select mode, use first element's styles as reference for UI state
	const computedStyles =
		selectedElement?.computedStyles ||
		(stylePanelStore.selectedElements.length > 0
			? stylePanelStore.selectedElements[0]?.computedStyles
			: undefined)
	const isBold = !!(computedStyles?.fontWeight && parseInt(computedStyles.fontWeight) >= 700)
	const isItalic = computedStyles?.fontStyle === "italic"
	const hasUnderline = computedStyles?.textDecoration?.includes("underline") ?? false
	const hasLineThrough = computedStyles?.textDecoration?.includes("line-through") ?? false
	const textAlign = computedStyles?.textAlign || "left"
	const currentColor = computedStyles?.color || "#000000"
	const capabilities = getElementCapabilities(selectedElement)

	// Disable controls when no element is selected or when saving
	// Check both single and multi-select modes
	const hasSelection = selectedElement !== null || stylePanelStore.selectedElements.length > 0
	const isDisabled = !hasSelection || disabled
	const showGlobal = variant !== "context"
	const showElementControls = variant !== "global"
	const contextClassName =
		variant === "context"
			? "w-full max-w-full flex-col items-stretch gap-2 overflow-x-hidden border-0 bg-transparent p-1"
			: ""
	const contextInnerClassName = variant === "context" ? "w-full flex-col items-stretch gap-1" : ""
	const textContentField = capabilities.showTypography ? (
		<div className="w-full min-w-0 basis-full">
			<label className="mb-2 block text-xs font-medium text-muted-foreground">
				<span className="mb-1 block">{t("stylePanel.textContent")}</span>
				<Textarea
					value={textContent}
					onChange={(event) => setTextContent(event.target.value)}
					onBlur={(event) => handleTextContentCommit(event.target.value)}
					placeholder={t("stylePanel.textContentPlaceholder")}
					rows={2}
					maxLength={5000}
					disabled={isDisabled}
					className="min-h-16 resize-y rounded-md px-2 py-1.5 text-sm"
				/>
			</label>
		</div>
	) : null

	if (variant === "context") {
		return (
			<TooltipProvider delayDuration={300}>
				<div className={cn("flex w-full min-w-0 flex-col gap-2", className)}>
					<div className={STYLE_PANEL_STYLES.section}>
						<div className={STYLE_PANEL_STYLES.sectionTitle}>
							{t("stylePanel.elementActions")}
						</div>
						<div className={STYLE_PANEL_STYLES.toolbarGroup}>
							<ElementActions editorRef={editorRef} disabled={disabled} />
						</div>
					</div>

					{capabilities.showTypography ? (
						<div className={STYLE_PANEL_STYLES.section}>
							<div className={STYLE_PANEL_STYLES.sectionTitle}>
								{t("stylePanel.text")}
							</div>
							{textContentField}
							<div className="grid min-w-0 grid-cols-[minmax(0,1.35fr)_minmax(0,0.65fr)] items-center gap-1.5">
								<FontFamilySelector
									value={fontFamily}
									onChange={handleFontFamilyChange}
									disabled={isDisabled}
									className="w-full"
								/>
								<FontSizeSelector
									value={fontSize}
									onChange={setFontSize}
									onApply={handleFontSizeApply}
									disabled={isDisabled}
									className="w-full"
								/>
							</div>
							<div className="flex items-center justify-start gap-2">
								<TextFormatTools
									isBold={isBold}
									isItalic={isItalic}
									hasUnderline={hasUnderline}
									hasLineThrough={hasLineThrough}
									onFormat={handleFormat}
									disabled={isDisabled}
								/>
								<ColorPicker
									value={currentColor}
									onChangeComplete={(value) => handleStyleChange("color", value)}
									disabled={isDisabled}
								/>
							</div>
						</div>
					) : null}

					{capabilities.isLink && selectedElement ? (
						<AnchorSection
							selectedElement={selectedElement}
							disabled={isDisabled}
							onUpdate={updateAttributes}
						/>
					) : null}

					{capabilities.showParagraph ? (
						<div className={STYLE_PANEL_STYLES.section}>
							<div className={STYLE_PANEL_STYLES.sectionTitle}>
								{t("stylePanel.paragraph")}
							</div>
							<div className="flex items-center justify-start gap-1 rounded-md border border-border/60 bg-muted/20 p-0.5">
								<TextAlignTools
									textAlign={textAlign}
									onAlign={handleAlign}
									disabled={isDisabled}
								/>
							</div>
						</div>
					) : null}

					<div className={STYLE_PANEL_STYLES.section}>
						<div className={STYLE_PANEL_STYLES.sectionTitle}>
							{t("stylePanel.appearanceAndLayout")}
						</div>
						<div className="min-w-0 space-y-1.5">
							{capabilities.showImage ? (
								<div className={STYLE_PANEL_STYLES.group}>
									<SizePopover
										selectedElement={selectedElement}
										disabled={isDisabled}
										showLabel
										inline
										onStyleChange={(property, value) =>
											handleStyleChange(property, value)
										}
										onBatchStyleChange={handleBatchStyleChange}
									/>
								</div>
							) : null}
							<div className={STYLE_PANEL_STYLES.group}>
								<BoxModelSection
									selectedElement={selectedElement}
									editorRef={editorRef}
									onStyleChange={handleStyleChange}
									showDimensions={!capabilities.showImage}
								/>
							</div>
							{capabilities.showImage ? (
								<div className={STYLE_PANEL_STYLES.group}>
									<ImageSection
										selectedElement={selectedElement}
										editorRef={editorRef}
										onStyleChange={handleStyleChange}
									/>
								</div>
							) : null}
							{capabilities.showFlexGrid ? (
								<div className={STYLE_PANEL_STYLES.group}>
									<FlexGridSection
										selectedElement={selectedElement}
										editorRef={editorRef}
										onStyleChange={handleStyleChange}
									/>
								</div>
							) : null}
							{capabilities.showBackground ? (
								<div className={STYLE_PANEL_STYLES.group}>
									<div className={STYLE_PANEL_STYLES.subsectionTitle}>
										{t("stylePanel.background")}
									</div>
									<BackgroundSection
										selectedElement={selectedElement}
										editorRef={editorRef}
										onStyleChange={handleStyleChange}
									/>
								</div>
							) : null}
							<div className={STYLE_PANEL_STYLES.group}>
								<div className={STYLE_PANEL_STYLES.subsectionTitle}>
									{t("stylePanel.border")}
								</div>
								<BorderSection
									selectedElement={selectedElement}
									editorRef={editorRef}
									onStyleChange={handleStyleChange}
								/>
							</div>
							<div className={STYLE_PANEL_STYLES.group}>
								<div className={STYLE_PANEL_STYLES.subsectionTitle}>
									{t("stylePanel.shadow")}
								</div>
								<ShadowSection
									selectedElement={selectedElement}
									editorRef={editorRef}
									onStyleChange={handleStyleChange}
								/>
							</div>
						</div>
					</div>

					<CustomCSSSection
						selectedElement={selectedElement}
						disabled={isDisabled}
						onApply={handleBatchStyleChange}
					/>
				</div>
			</TooltipProvider>
		)
	}

	return (
		<TooltipProvider delayDuration={300}>
			<div
				className={cn(
					"border-b bg-card/95 px-2 py-1.5 backdrop-blur supports-[backdrop-filter]:bg-card/60",
					contextClassName,
					toolbarEndRef
						? "flex w-full min-w-0 items-center gap-2"
						: "flex flex-wrap items-center gap-1",
					className,
				)}
			>
				<div
					className={cn(
						"flex items-center gap-1",
						contextInnerClassName,
						toolbarEndRef ? "min-w-0 flex-1 flex-wrap" : "flex-wrap",
					)}
				>
					{showGlobal ? <HistoryActions editorRef={editorRef} /> : null}
					{showGlobal && showElementControls ? (
						<Separator
							orientation={variant === "context" ? "horizontal" : "vertical"}
							className={variant === "context" ? "my-1 w-full" : "mx-1 !h-4"}
						/>
					) : null}

					{showElementControls ? (
						<>
							{/* Element actions (duplicate, delete) */}
							<ElementActions editorRef={editorRef} disabled={disabled} />
							<Separator
								orientation={variant === "context" ? "horizontal" : "vertical"}
								className={variant === "context" ? "my-1 w-full" : "mx-1 !h-4"}
							/>

							{capabilities.showTypography ? (
								<>
									{textContentField}
									<FontFamilySelector
										value={fontFamily}
										onChange={handleFontFamilyChange}
										disabled={isDisabled}
									/>
									<FontSizeSelector
										value={fontSize}
										onChange={setFontSize}
										onApply={handleFontSizeApply}
										disabled={isDisabled}
									/>
									<FontSizeAdjuster
										onAdjust={handleFontSizeAdjust}
										disabled={isDisabled}
									/>
								</>
							) : null}

							<Separator
								orientation={variant === "context" ? "horizontal" : "vertical"}
								className={variant === "context" ? "my-1 w-full" : "mx-1 !h-4"}
							/>

							{capabilities.showTypography ? (
								<TextFormatTools
									isBold={isBold}
									isItalic={isItalic}
									hasUnderline={hasUnderline}
									hasLineThrough={hasLineThrough}
									onFormat={handleFormat}
									disabled={isDisabled}
								/>
							) : null}

							<Separator
								orientation={variant === "context" ? "horizontal" : "vertical"}
								className={variant === "context" ? "my-1 w-full" : "mx-1 !h-4"}
							/>

							{capabilities.showParagraph ? (
								<TextAlignTools
									textAlign={textAlign}
									onAlign={handleAlign}
									disabled={isDisabled}
								/>
							) : null}

							<Separator
								orientation={variant === "context" ? "horizontal" : "vertical"}
								className={variant === "context" ? "my-1 w-full" : "mx-1 !h-4"}
							/>

							{capabilities.showTypography ? (
								<ColorPicker
									value={currentColor}
									onChangeComplete={(value) => handleStyleChange("color", value)}
									disabled={isDisabled}
								/>
							) : null}

							<Separator
								orientation={variant === "context" ? "horizontal" : "vertical"}
								className={variant === "context" ? "my-1 w-full" : "mx-1 !h-4"}
							/>

							{/* Size settings */}
							<SizePopover
								selectedElement={selectedElement}
								disabled={isDisabled}
								showLabel={variant === "context" ? true : showButtonLabel}
								onStyleChange={(property, value) =>
									handleStyleChange(property, value)
								}
								onBatchStyleChange={handleBatchStyleChange}
							/>

							<Separator
								orientation={variant === "context" ? "horizontal" : "vertical"}
								className={variant === "context" ? "my-1 w-full" : "mx-1 !h-4"}
							/>

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
									showLabel={variant === "context" ? true : showButtonLabel}
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
									showLabel={variant === "context" ? true : showButtonLabel}
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
									showLabel={variant === "context" ? true : showButtonLabel}
								>
									<BackgroundSection
										selectedElement={selectedElement}
										editorRef={editorRef}
										onStyleChange={handleStyleChange}
									/>
								</StylePopoverButton>
							) : null}

							{/* Border settings */}
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

							{/* Shadow & effects */}
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
