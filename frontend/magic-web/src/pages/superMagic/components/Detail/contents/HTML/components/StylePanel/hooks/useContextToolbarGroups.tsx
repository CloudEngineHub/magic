import { useMemo, type ReactNode } from "react"
import type { HTMLEditorV2Ref } from "../../../iframe-bridge/types/props"
import type { ElementCapabilities } from "../capabilities"
import type { ContextToolbarItemMotion, SelectedElementInfo } from "../types"
import type { ContextToolGroup } from "../utils/contextToolbarPartition"
import {
	BackgroundImageButton,
	ColorPicker,
	ElementActions,
	FontSizeAdjuster,
	FontSizeSelector,
	LineHeightSelector,
	TextAlignTools,
	TextFormatTools,
} from "../controls"

export interface UseContextToolbarGroupsParams {
	capabilities: ElementCapabilities
	editorRef: React.RefObject<HTMLEditorV2Ref>
	disabled: boolean
	isDisabled: boolean
	selectedElement: SelectedElementInfo | null
	fontSize: string
	setFontSize: (size: string) => void
	handleFontSizeApply: (size: string) => void
	handleFontSizeAdjust: (direction: "increase" | "decrease") => Promise<void>
	lineHeight: string
	setLineHeight: (lh: string) => void
	handleLineHeightApply: (lh: string) => void
	isBold: boolean
	isItalic: boolean
	hasUnderline: boolean
	hasLineThrough: boolean
	handleFormat: (format: "bold" | "italic" | "underline" | "lineThrough", active: boolean) => void
	showAlignmentTools: boolean
	flexAlignment: { value: string; direction: string; targetSelector: string } | null
	textAlign: "left" | "center" | "right" | "justify"
	handleAlignment: (align: "left" | "center" | "right" | "justify") => void
	currentColor: string
	handleStyleChange: (property: string, value: string) => Promise<void>
	showBackgroundImageAction: boolean
	contextMorePopover: ReactNode
	renderContextToolbarItem: ContextToolbarItemMotion
}

export function useContextToolbarGroups({
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
}: UseContextToolbarGroupsParams): ContextToolGroup<{ node: ReactNode }>[] {
	return useMemo<ContextToolGroup<{ node: ReactNode }>[]>(() => {
		const list: ContextToolGroup<{ node: ReactNode }>[] = []

		// 1. Actions group
		list.push({
			id: "actions",
			estimatedWidth: 124,
			data: {
				node: (
					<ElementActions
						editorRef={editorRef}
						disabled={disabled}
						itemMotion={renderContextToolbarItem}
					/>
				),
			},
		})

		// 2. Typography sizes group (fontSize, adjuster, lineHeight)
		if (capabilities.showTypography || capabilities.showFontSizeAdjuster) {
			const sizeNodes: ReactNode[] = []
			let estimatedWidth = 0

			if (capabilities.showFontSize) {
				sizeNodes.push(
					renderContextToolbarItem(
						<FontSizeSelector
							key="fontSize"
							value={fontSize}
							onChange={setFontSize}
							onApply={handleFontSizeApply}
							disabled={isDisabled}
							className="max-w-[220px] shrink-0"
						/>,
						"fontSize",
					),
				)
				estimatedWidth += 88
			}

			if (capabilities.showFontSizeAdjuster) {
				sizeNodes.push(
					<FontSizeAdjuster
						key="fontAdjuster"
						onAdjust={handleFontSizeAdjust}
						disabled={isDisabled}
						itemMotion={renderContextToolbarItem}
					/>,
				)
				estimatedWidth += 56
			}

			if (capabilities.showTypography) {
				sizeNodes.push(
					renderContextToolbarItem(
						<LineHeightSelector
							key="lineHeight"
							value={lineHeight}
							fontSize={fontSize}
							onChange={setLineHeight}
							onApply={handleLineHeightApply}
							disabled={isDisabled}
							className="max-w-[220px] shrink-0"
						/>,
						"lineHeight",
					),
				)
				estimatedWidth += 88
			}

			list.push({
				id: "typography",
				estimatedWidth,
				data: {
					node: <div className="flex items-center gap-1">{sizeNodes}</div>,
				},
			})
		}

		// 3. Formatting tools
		if (capabilities.showTypography) {
			list.push({
				id: "formatting",
				estimatedWidth: 116,
				data: {
					node: (
						<TextFormatTools
							isBold={isBold}
							isItalic={isItalic}
							hasUnderline={hasUnderline}
							hasLineThrough={hasLineThrough}
							onFormat={handleFormat}
							disabled={isDisabled}
							itemMotion={renderContextToolbarItem}
						/>
					),
				},
			})
		}

		// 4. Alignment tools
		if (showAlignmentTools) {
			list.push({
				id: "alignment",
				estimatedWidth: 96,
				data: {
					node: (
						<TextAlignTools
							value={flexAlignment?.value || textAlign}
							onAlign={handleAlignment}
							mode={flexAlignment ? "flex" : "text"}
							flexDirection={flexAlignment?.direction}
							disabled={isDisabled}
							compact
							itemMotion={renderContextToolbarItem}
						/>
					),
				},
			})
		}

		// 5. Appearance tools (Color + Background Image)
		if (capabilities.showTypography || showBackgroundImageAction) {
			const appearanceNodes: ReactNode[] = []
			let estimatedWidth = 0

			if (capabilities.showTypography) {
				appearanceNodes.push(
					renderContextToolbarItem(
						<ColorPicker
							key="color"
							value={currentColor}
							onChangeComplete={(value) => handleStyleChange("color", value)}
							disabled={isDisabled}
						/>,
						"color",
					),
				)
				estimatedWidth += 32
			}

			if (showBackgroundImageAction) {
				appearanceNodes.push(
					<BackgroundImageButton
						key="bgImage"
						selectedElement={selectedElement}
						editorRef={editorRef}
						disabled={isDisabled}
						itemMotion={renderContextToolbarItem}
					/>,
				)
				estimatedWidth += 32
			}

			list.push({
				id: "appearance",
				estimatedWidth,
				data: {
					node: <div className="flex items-center gap-1">{appearanceNodes}</div>,
				},
			})
		}

		// 6. More styles entry
		list.push({
			id: "more",
			estimatedWidth: 76,
			data: {
				node: renderContextToolbarItem(contextMorePopover),
			},
		})

		return list
	}, [
		capabilities.showFontSize,
		capabilities.showFontSizeAdjuster,
		capabilities.showTypography,
		contextMorePopover,
		currentColor,
		disabled,
		editorRef,
		flexAlignment,
		fontSize,
		handleAlignment,
		handleFontSizeAdjust,
		handleFontSizeApply,
		handleFormat,
		handleLineHeightApply,
		handleStyleChange,
		hasLineThrough,
		hasUnderline,
		isBold,
		isDisabled,
		isItalic,
		lineHeight,
		renderContextToolbarItem,
		selectedElement,
		setFontSize,
		setLineHeight,
		showAlignmentTools,
		showBackgroundImageAction,
		textAlign,
	])
}
