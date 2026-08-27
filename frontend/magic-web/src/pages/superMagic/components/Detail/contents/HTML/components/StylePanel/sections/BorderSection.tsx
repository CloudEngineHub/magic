import { observer } from "mobx-react-lite"
import { useCallback, useEffect, useState } from "react"
import { useDebounceFn } from "ahooks"
import { useTranslation } from "react-i18next"
import { Input } from "@/components/shadcn-ui/input"
import { Label } from "@/components/shadcn-ui/label"
import { Select, SelectItem, SelectTrigger, SelectValue } from "@/components/shadcn-ui/select"
import type { StyleSectionProps } from "../types"
import { EditorSelectContent } from "../../EditorFloating"
import { NumericDragInput } from "../controls"

const BORDER_STYLES = ["none", "solid", "dashed", "dotted", "double"]

function parseNumericStyle(value: string | undefined, fallback = 0): number {
	const parsed = Number.parseFloat(value?.trim().split(/\s+/)[0] ?? "")
	return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback
}

/**
 * 边框样式配置区域
 */
const BorderSection = observer(function BorderSection({
	selectedElement,
	onStyleChange,
}: StyleSectionProps) {
	const { t } = useTranslation("super")
	const computedStyles = selectedElement?.computedStyles

	// 解析当前值
	const currentBorderWidth = computedStyles?.borderWidth || "0px"
	const currentBorderStyle = computedStyles?.borderStyle || "none"
	const currentBorderColor = computedStyles?.borderColor || "#000000"
	const currentBorderRadius = computedStyles?.borderRadius || "0px"

	// 本地状态
	const [borderWidth, setBorderWidth] = useState(parseNumericStyle(currentBorderWidth))
	const [borderColor, setBorderColor] = useState(currentBorderColor)
	const [borderRadius, setBorderRadius] = useState(parseNumericStyle(currentBorderRadius))

	useEffect(() => {
		setBorderWidth(parseNumericStyle(currentBorderWidth))
		setBorderColor(currentBorderColor)
		setBorderRadius(parseNumericStyle(currentBorderRadius))
	}, [currentBorderColor, currentBorderRadius, currentBorderWidth, selectedElement?.selector])

	// Debounce for input changes
	const { run: onStyleChangeDebounced } = useDebounceFn(
		(property: string, value: string) => {
			onStyleChange?.(property, value)
		},
		{ wait: 300 },
	)

	/**
	 * 处理边框宽度变化
	 */
	const handleBorderWidthChange = useCallback(
		(value: string) => {
			const numValue = Number.parseFloat(value)
			if (!isNaN(numValue) && numValue >= 0) {
				setBorderWidth(numValue)
				onStyleChangeDebounced("borderWidth", `${numValue}px`)
				if (numValue > 0 && currentBorderStyle === "none") {
					onStyleChange?.("borderStyle", "solid")
				}
			}
		},
		[currentBorderStyle, onStyleChange, onStyleChangeDebounced],
	)

	/**
	 * 处理边框样式变化
	 */
	const handleBorderStyleChange = useCallback(
		(value: string) => {
			if (value !== "none" && borderWidth === 0) {
				setBorderWidth(1)
				onStyleChange?.("borderWidth", "1px")
			}
			onStyleChange?.("borderStyle", value)
		},
		[borderWidth, onStyleChange],
	)

	/**
	 * 处理边框颜色变化
	 */
	const handleBorderColorChange = useCallback(
		(value: string) => {
			setBorderColor(value)
			if (value.trim() && borderWidth === 0) {
				setBorderWidth(1)
				onStyleChange?.("borderWidth", "1px")
			}
			if (value.trim() && currentBorderStyle === "none") {
				onStyleChange?.("borderStyle", "solid")
			}
			onStyleChangeDebounced("borderColor", value)
		},
		[borderWidth, currentBorderStyle, onStyleChange, onStyleChangeDebounced],
	)

	/**
	 * 处理圆角变化
	 */
	const handleBorderRadiusChange = useCallback(
		(value: string) => {
			const numValue = Number.parseFloat(value)
			if (!isNaN(numValue) && numValue >= 0) {
				setBorderRadius(numValue)
				onStyleChangeDebounced("borderRadius", `${numValue}px`)
			}
		},
		[onStyleChangeDebounced],
	)

	return (
		<div className="min-w-0 space-y-3">
			{/* 边框宽度 */}
			<div className="min-w-0 space-y-1">
				<Label
					htmlFor="border-width"
					className="text-[11px] font-medium leading-4 text-muted-foreground"
				>
					{t("stylePanel.borderWidth")}
				</Label>
				<div className="flex items-center gap-2">
					<NumericDragInput
						id="border-width"
						value={String(borderWidth)}
						onChange={handleBorderWidthChange}
						className="h-7 min-w-0 flex-1 rounded-md"
						min={0}
					/>
					<span className="text-xs text-muted-foreground">px</span>
				</div>
			</div>

			{/* 边框样式 */}
			<div className="min-w-0 space-y-1">
				<Label
					htmlFor="border-style"
					className="text-[11px] font-medium leading-4 text-muted-foreground"
				>
					{t("stylePanel.borderStyle")}
				</Label>
				<Select value={currentBorderStyle} onValueChange={handleBorderStyleChange}>
					<SelectTrigger id="border-style" className="h-7 w-full rounded-md px-2 text-xs">
						<SelectValue />
					</SelectTrigger>
					<EditorSelectContent>
						{BORDER_STYLES.map((style) => (
							<SelectItem key={style} value={style}>
								{t(`stylePanel.borderStyleOptions.${style}`)}
							</SelectItem>
						))}
					</EditorSelectContent>
				</Select>
			</div>

			{/* 边框颜色 */}
			<div className="min-w-0 space-y-1">
				<Label
					htmlFor="border-color"
					className="text-[11px] font-medium leading-4 text-muted-foreground"
				>
					{t("stylePanel.borderColor")}
				</Label>
				<div className="flex gap-2">
					<Input
						id="border-color"
						type="color"
						value={borderColor}
						onChange={(e) => handleBorderColorChange(e.target.value)}
						className="h-7 w-12 cursor-pointer rounded-md p-1"
					/>
					<Input
						type="text"
						value={borderColor}
						onChange={(e) => handleBorderColorChange(e.target.value)}
						placeholder="#000000"
						className="h-7 min-w-0 flex-1 rounded-md font-mono text-xs"
					/>
				</div>
			</div>

			{/* 圆角 */}
			<div className="min-w-0 space-y-1">
				<Label
					htmlFor="border-radius"
					className="text-[11px] font-medium leading-4 text-muted-foreground"
				>
					{t("stylePanel.borderRadius")}
				</Label>
				<div className="flex items-center gap-2">
					<NumericDragInput
						id="border-radius"
						value={String(borderRadius)}
						onChange={handleBorderRadiusChange}
						className="h-7 min-w-0 flex-1 rounded-md"
						min={0}
					/>
					<span className="text-xs text-muted-foreground">px</span>
				</div>
			</div>
		</div>
	)
})

export default BorderSection
