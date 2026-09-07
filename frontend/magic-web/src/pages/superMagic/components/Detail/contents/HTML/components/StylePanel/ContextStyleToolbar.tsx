import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { observer } from "mobx-react-lite"
import { Separator } from "@/components/shadcn-ui/separator"
import { Textarea } from "@/components/shadcn-ui/textarea"
import { TooltipProvider } from "@/components/shadcn-ui/tooltip"
import { cn } from "@/utils/cn"
import type { ElementRect } from "../SelectionOverlay/types"
import type { HTMLEditorV2Ref } from "../../iframe-bridge/types/props"
import { useStylePanelStore } from "../../iframe-bridge/contexts/StylePanelContext"
import { useSelectedElement } from "./hooks/useSelectedElement"
import { getElementCapabilities } from "./capabilities"
import { areLineHeightsEquivalent } from "./utils/lineHeight"
import {
	CONTEXT_TOOLBAR_ROW_MAX_WIDTH,
	partitionContextToolGroups,
} from "./utils/contextToolbarPartition"
import { ContextMorePopover, ContextToolbarMotion, FontFamilySelector } from "./controls"
import { useContextToolbarGroups } from "./hooks/useContextToolbarGroups"
import type { ContextToolbarItemMotion } from "./types"

export interface ContextStyleToolbarProps {
	editorRef: React.RefObject<HTMLEditorV2Ref>
	onStyleChange?: (selector: string, property: string, value: string) => void
	disabled?: boolean
	className?: string
	contextToolbarOpen?: boolean
	selectionRect?: ElementRect | null
	boundaryRef?: React.RefObject<HTMLElement | null>
}

export const ContextStyleToolbar = observer(function ContextStyleToolbar({
	editorRef,
	onStyleChange: externalOnStyleChange,
	disabled = false,
	className,
	contextToolbarOpen = true,
	selectionRect,
	boundaryRef,
}: ContextStyleToolbarProps) {
	const { t } = useTranslation("super")
	const { selectedElement, updateStyle, updateBatchStyles, updateAttributes } =
		useSelectedElement(editorRef)
	const stylePanelStore = useStylePanelStore()

	const [fontSize, setFontSize] = useState("16")
	const [lineHeight, setLineHeight] = useState("normal")
	const [fontFamily, setFontFamily] = useState("sans-serif")
	const [textContent, setTextContent] = useState("")
	const lineHeightDisplayRef = useRef<{ selector: string; value: string } | null>(null)

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

	useEffect(() => {
		if (selectedElement?.computedStyles) {
			setTextContent(selectedElement.textContent ?? "")
			const {
				fontSize: computedFontSize,
				fontFamily: computedFontFamily,
				lineHeight: computedLineHeight,
			} = selectedElement.computedStyles

			if (computedFontSize) {
				const sizeMatch = computedFontSize.match(/(\d+)/)
				if (sizeMatch) {
					setFontSize(Number.parseInt(sizeMatch[1], 10).toString())
				}
			}

			if (computedFontFamily) {
				setFontFamily(computedFontFamily.split(",")[0].trim().replace(/['"]/g, ""))
			}
			const preservedLineHeight =
				lineHeightDisplayRef.current?.selector === selectedElement.selector &&
				areLineHeightsEquivalent(
					lineHeightDisplayRef.current.value,
					computedLineHeight || "normal",
					computedFontSize,
				)
					? lineHeightDisplayRef.current.value
					: null
			if (!preservedLineHeight) lineHeightDisplayRef.current = null
			setLineHeight(preservedLineHeight || computedLineHeight || "normal")
		} else if (stylePanelStore.selectedElements.length > 0) {
			lineHeightDisplayRef.current = null
			setTextContent("")
			const firstElement = stylePanelStore.selectedElements[0]
			if (firstElement?.computedStyles) {
				const {
					fontSize: computedFontSize,
					fontFamily: computedFontFamily,
					lineHeight: computedLineHeight,
				} = firstElement.computedStyles

				if (computedFontSize) {
					const sizeMatch = computedFontSize.match(/(\d+)/)
					if (sizeMatch) {
						setFontSize(Number.parseInt(sizeMatch[1], 10).toString())
					}
				}

				if (computedFontFamily) {
					setFontFamily(computedFontFamily.split(",")[0].trim().replace(/['"]/g, ""))
				}

				setLineHeight(computedLineHeight || "normal")
			}
		}
	}, [selectedElement, stylePanelStore.selectedElements])

	const handleStyleChange = useCallback(
		async (property: string, value: string) => {
			if (selectedElement) {
				externalOnStyleChange?.(selectedElement.selector, property, value)
			}
			await updateStyle(property, value)
		},
		[externalOnStyleChange, selectedElement, updateStyle],
	)

	const handleBatchStyleChange = useCallback(
		async (styles: Record<string, string>) => {
			if (selectedElement) {
				for (const [property, value] of Object.entries(styles)) {
					externalOnStyleChange?.(selectedElement.selector, property, value)
				}
			}
			await updateBatchStyles(styles)
		},
		[externalOnStyleChange, selectedElement, updateBatchStyles],
	)

	const handleFontSizeApply = useCallback(
		(newSize: string) => {
			handleStyleChange("fontSize", `${newSize}px`)
		},
		[handleStyleChange],
	)

	const handleFontSizeAdjust = useCallback(
		async (direction: "increase" | "decrease") => {
			const selectors = stylePanelStore.getSelectedSelectors()
			if (selectors.length === 0 || !editorRef?.current) {
				console.warn("[StylePanel] No elements selected for font size adjustment")
				return
			}

			try {
				const scaleFactor = direction === "increase" ? 1.1 : 0.9
				const minFontSize = 8

				for (const selector of selectors) {
					await editorRef.current.adjustFontSizeRecursive?.(
						selector,
						scaleFactor,
						minFontSize,
					)
				}

				const iframe = editorRef.current as { iframeRef?: { current?: HTMLIFrameElement } }
				const iframeWindow = iframe.iframeRef?.current?.contentWindow

				if (iframeWindow?.document) {
					const element = iframeWindow.document.querySelector(selectors[0])
					if (element && "style" in element) {
						const computedStyle = iframeWindow.getComputedStyle(element)
						const actualFontSize = Number.parseFloat(computedStyle.fontSize)
						if (!Number.isNaN(actualFontSize)) {
							setFontSize(Math.round(actualFontSize).toString())
						}
					}
				}
			} catch (error) {
				console.error("[StylePanel] Failed to adjust font size:", error)
			}
		},
		[editorRef, stylePanelStore],
	)

	const handleLineHeightApply = useCallback(
		(newLineHeight: string) => {
			lineHeightDisplayRef.current = selectedElement
				? { selector: selectedElement.selector, value: newLineHeight }
				: null
			setLineHeight(newLineHeight)
			handleStyleChange("lineHeight", newLineHeight)
		},
		[handleStyleChange, selectedElement],
	)

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

	const handleFontFamilyChange = useCallback(
		(newFontFamily: string) => {
			setFontFamily(newFontFamily)
			handleStyleChange("fontFamily", newFontFamily)
		},
		[handleStyleChange],
	)

	const handleFormat = useCallback(
		(format: "bold" | "italic" | "underline" | "lineThrough", active: boolean) => {
			const formatStyleMap: Record<typeof format, { property: string; value: string }> = {
				bold: { property: "fontWeight", value: active ? "bold" : "normal" },
				italic: { property: "fontStyle", value: active ? "italic" : "normal" },
				underline: { property: "textDecoration", value: active ? "underline" : "none" },
				lineThrough: {
					property: "textDecoration",
					value: active ? "line-through" : "none",
				},
			}
			const style = formatStyleMap[format]
			handleStyleChange(style.property, style.value)
		},
		[handleStyleChange],
	)

	const handleAlignment = useCallback(
		(align: "left" | "center" | "right" | "justify") => {
			if (flexAlignment) {
				const flexAlignMap: Record<string, string> = {
					left: "flex-start",
					center: "center",
					right: "flex-end",
					justify: "space-between",
				}
				const flexValue = flexAlignMap[align] || align
				handleStyleChange("justifyContent", flexValue)
				return
			}
			handleStyleChange("textAlign", align)
		},
		[flexAlignment, handleStyleChange],
	)

	const isBold =
		computedStyles?.fontWeight === "bold" || Number(computedStyles?.fontWeight) >= 700
	const isItalic = computedStyles?.fontStyle === "italic"
	const hasUnderline = computedStyles?.textDecoration?.includes("underline") || false
	const hasLineThrough = computedStyles?.textDecoration?.includes("line-through") || false
	const textAlign =
		(computedStyles?.textAlign as "left" | "center" | "right" | "justify") || "left"
	const currentColor = computedStyles?.color || "#000000"

	const capabilities = getElementCapabilities(selectedElement)
	const showAlignmentTools = capabilities.showParagraph || Boolean(flexAlignment)
	const showBackgroundImageAction =
		selectedElement !== null &&
		!selectedElement.isImageElement &&
		selectedElement.tagName.toLowerCase() !== "img"

	const hasSelection = selectedElement !== null || stylePanelStore.selectedElements.length > 0
	const isDisabled = !hasSelection || disabled

	const renderContextToolbarItem = useCallback<ContextToolbarItemMotion>(
		(children, key) => (
			<ContextToolbarMotion key={key} enabled open={contextToolbarOpen} as="span">
				{children}
			</ContextToolbarMotion>
		),
		[contextToolbarOpen],
	)

	const textContentField = capabilities.showTypography ? (
		<div className="w-full min-w-0 basis-full">
			<label className="mb-2 block text-xs font-medium text-muted-foreground">
				<span className="mb-1 block">{t("stylePanel.textContent")}</span>
				<Textarea
					data-testid="html-editor-text-content-input"
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
			showBorder={capabilities.showBorder}
			showShadow={capabilities.showShadow}
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
			selectionRect={selectionRect}
			boundaryRef={boundaryRef}
		/>
	)

	// Build atomic tool groups for contextual editing
	const groups = useContextToolbarGroups({
		capabilities,
		editorRef,
		disabled,
		isDisabled,
		selectedElement,
		fontSize,
		setFontSize,
		handleFontSizeApply,
		handleFontSizeAdjust,
		lineHeight,
		setLineHeight,
		handleLineHeightApply,
		isBold,
		isItalic,
		hasUnderline,
		hasLineThrough,
		handleFormat,
		showAlignmentTools,
		flexAlignment,
		textAlign,
		handleAlignment,
		currentColor,
		handleStyleChange,
		showBackgroundImageAction,
		contextMorePopover,
		renderContextToolbarItem,
	})

	const rows = useMemo(() => {
		return partitionContextToolGroups(groups, CONTEXT_TOOLBAR_ROW_MAX_WIDTH)
	}, [groups])

	return (
		<TooltipProvider delayDuration={300}>
			<div
				data-testid="html-editor-context-style-toolbar"
				className={cn(
					"w-fit max-w-full overflow-visible border-0 bg-transparent p-0",
					rows.length > 1 ? "flex flex-col items-start gap-1" : "flex items-center gap-1",
					className,
				)}
			>
				{rows.map((row, rowIndex) => (
					<div
						key={rowIndex}
						data-context-toolbar-row={rowIndex}
						className="flex w-fit items-center gap-1"
					>
						{row.map((group, groupIndex) => (
							<Fragment key={group.id}>
								{groupIndex > 0 ? (
									<Separator
										orientation="vertical"
										className="mx-1 !h-4 bg-border/70"
									/>
								) : null}
								{group.data?.node}
							</Fragment>
						))}
					</div>
				))}
			</div>
		</TooltipProvider>
	)
})
