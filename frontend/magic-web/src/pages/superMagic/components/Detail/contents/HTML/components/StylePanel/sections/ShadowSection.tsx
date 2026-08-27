import { observer } from "mobx-react-lite"
import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Input } from "@/components/shadcn-ui/input"
import { NumericDragInput } from "../controls"
import { Label } from "@/components/shadcn-ui/label"
import { Slider } from "@/components/shadcn-ui/slider"
import { Checkbox } from "@/components/shadcn-ui/checkbox"
import type { StyleSectionProps } from "../types"
import {
	parseBoxShadow,
	buildBoxShadow,
	extractHexColor,
	type BoxShadowValue,
} from "../utils/shadowParser"

function parseOpacity(value: string): number {
	const parsed = Number.parseFloat(value)
	return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : 1
}

/**
 * Shadow & Effects style configuration section
 */
const ShadowSection = observer(function ShadowSection({
	selectedElement,
	onStyleChange,
}: StyleSectionProps) {
	const { t } = useTranslation("super")
	const computedStyles = selectedElement?.computedStyles

	// Parse current box shadow
	const currentBoxShadow = computedStyles?.boxShadow || "none"
	const currentOpacity = computedStyles?.opacity || "1"

	// Local state for box shadow
	const [shadow, setShadow] = useState<BoxShadowValue>(() => parseBoxShadow(currentBoxShadow))
	const [opacity, setOpacity] = useState<number>(() => parseOpacity(currentOpacity))

	// Keep separate timers so editing opacity cannot cancel a pending shadow update.
	const shadowUpdateTimerRef = useRef<number>()
	const opacityUpdateTimerRef = useRef<number>()

	// Computed styles are the source of truth after undo/redo and external updates.
	// The selector alone is not enough because history replay keeps the same element selected.
	useEffect(() => {
		// Cancel stale local writes when a new computed value arrives from the iframe.
		// This prevents an external restore from being overwritten by an old debounce callback.
		if (shadowUpdateTimerRef.current !== undefined) {
			clearTimeout(shadowUpdateTimerRef.current)
			shadowUpdateTimerRef.current = undefined
		}
		if (opacityUpdateTimerRef.current !== undefined) {
			clearTimeout(opacityUpdateTimerRef.current)
			opacityUpdateTimerRef.current = undefined
		}

		setShadow(parseBoxShadow(currentBoxShadow))
		setOpacity(parseOpacity(currentOpacity))
	}, [currentBoxShadow, currentOpacity, selectedElement?.selector])

	// Store latest shadow and opacity in refs
	const shadowRef = useRef(shadow)

	// Update refs when state changes
	useEffect(() => {
		shadowRef.current = shadow
	}, [shadow])

	/**
	 * Apply box shadow change with debounce
	 */
	const applyBoxShadowChange = useCallback(
		(newShadow: BoxShadowValue) => {
			if (shadowUpdateTimerRef.current !== undefined) {
				clearTimeout(shadowUpdateTimerRef.current)
			}

			shadowUpdateTimerRef.current = window.setTimeout(() => {
				shadowUpdateTimerRef.current = undefined
				const shadowString = buildBoxShadow(newShadow)
				onStyleChange?.("boxShadow", shadowString)
			}, 100)
		},
		[onStyleChange],
	)

	/**
	 * Handle offset X change
	 */
	const handleOffsetXChange = useCallback(
		(value: number[]) => {
			const newShadow = { ...shadowRef.current, offsetX: value[0] }
			setShadow(newShadow)
			applyBoxShadowChange(newShadow)
		},
		[applyBoxShadowChange],
	)

	/**
	 * Handle offset Y change
	 */
	const handleOffsetYChange = useCallback(
		(value: number[]) => {
			const newShadow = { ...shadowRef.current, offsetY: value[0] }
			setShadow(newShadow)
			applyBoxShadowChange(newShadow)
		},
		[applyBoxShadowChange],
	)

	/**
	 * Handle blur change
	 */
	const handleBlurChange = useCallback(
		(value: number[]) => {
			const newShadow = { ...shadowRef.current, blur: value[0] }
			setShadow(newShadow)
			applyBoxShadowChange(newShadow)
		},
		[applyBoxShadowChange],
	)

	/**
	 * Handle spread change
	 */
	const handleSpreadChange = useCallback(
		(value: number[]) => {
			const newShadow = { ...shadowRef.current, spread: value[0] }
			setShadow(newShadow)
			applyBoxShadowChange(newShadow)
		},
		[applyBoxShadowChange],
	)

	const handleShadowValueInput = useCallback(
		(property: "offsetX" | "offsetY" | "blur" | "spread", inputValue: string) => {
			const value = Number.parseFloat(inputValue)
			if (!Number.isFinite(value)) return
			const newShadow = { ...shadowRef.current, [property]: value }
			setShadow(newShadow)
			applyBoxShadowChange(newShadow)
		},
		[applyBoxShadowChange],
	)

	/**
	 * Handle color change
	 */
	const handleColorChange = useCallback(
		(color: string) => {
			const newShadow = { ...shadowRef.current, color }
			setShadow(newShadow)
			applyBoxShadowChange(newShadow)
		},
		[applyBoxShadowChange],
	)

	/**
	 * Handle inset toggle
	 */
	const handleInsetChange = useCallback(
		(checked: boolean) => {
			if (shadowUpdateTimerRef.current !== undefined) {
				clearTimeout(shadowUpdateTimerRef.current)
				shadowUpdateTimerRef.current = undefined
			}

			const newShadow = { ...shadowRef.current, inset: checked }
			setShadow(newShadow)
			// Apply immediately for checkbox
			const shadowString = buildBoxShadow(newShadow)
			onStyleChange?.("boxShadow", shadowString)
		},
		[onStyleChange],
	)

	/**
	 * Apply opacity change with debounce
	 */
	const applyOpacityChange = useCallback(
		(value: number) => {
			if (opacityUpdateTimerRef.current !== undefined) {
				clearTimeout(opacityUpdateTimerRef.current)
			}

			opacityUpdateTimerRef.current = window.setTimeout(() => {
				opacityUpdateTimerRef.current = undefined
				onStyleChange?.("opacity", value.toString())
			}, 100)
		},
		[onStyleChange],
	)

	/**
	 * Handle opacity change
	 */
	const handleOpacityChange = useCallback(
		(value: number[]) => {
			const newOpacity = value[0]
			setOpacity(newOpacity)
			applyOpacityChange(newOpacity)
		},
		[applyOpacityChange],
	)

	/**
	 * Handle opacity input change
	 */
	const handleOpacityInputChange = useCallback(
		(inputValue: string) => {
			const value = parseFloat(inputValue)
			if (!isNaN(value) && value >= 0 && value <= 1) {
				setOpacity(value)
				applyOpacityChange(value)
			}
		},
		[applyOpacityChange],
	)

	// Cleanup timer on unmount
	useEffect(() => {
		return () => {
			if (shadowUpdateTimerRef.current !== undefined) {
				clearTimeout(shadowUpdateTimerRef.current)
			}
			if (opacityUpdateTimerRef.current !== undefined) {
				clearTimeout(opacityUpdateTimerRef.current)
			}
		}
	}, [])

	// Extract hex color for color input
	const hexColor = extractHexColor(shadow.color)

	return (
		<div className="min-w-0 space-y-3">
			{/* Box Shadow */}
			<div className="space-y-2">
				<div className="w-full" title={t("stylePanel.shadowPreview")}>
					<div
						aria-label={t("stylePanel.shadowPreview")}
						className="flex h-14 w-full min-w-0 items-center justify-center rounded-md border border-border/60 bg-muted/20"
						data-testid="html-style-panel-shadow-preview"
					>
						<div
							className="h-7 w-12 rounded-sm border border-border/70 bg-background transition-[box-shadow,opacity] duration-150 ease-out"
							style={{
								boxShadow: buildBoxShadow(shadow),
								opacity,
							}}
						/>
					</div>
				</div>

				{/* Offset X */}
				<div className="space-y-1.5">
					<div className="flex items-center justify-between">
						<Label className="text-[11px] font-medium leading-4 text-muted-foreground">
							{t("stylePanel.shadowOffsetX")}
						</Label>
						<div className="flex items-center gap-1">
							<NumericDragInput
								value={String(shadow.offsetX)}
								onChange={(value) => handleShadowValueInput("offsetX", value)}
								min={-100}
								max={100}
								className="h-6 w-14 rounded-md px-1 text-right text-xs"
								aria-label={t("stylePanel.shadowOffsetX")}
							/>
							<span className="text-xs text-muted-foreground">px</span>
						</div>
					</div>
					<Slider
						value={[shadow.offsetX]}
						onValueChange={handleOffsetXChange}
						min={-100}
						max={100}
						step={1}
						className="w-full"
					/>
				</div>

				{/* Offset Y */}
				<div className="space-y-1.5">
					<div className="flex items-center justify-between">
						<Label className="text-[11px] font-medium leading-4 text-muted-foreground">
							{t("stylePanel.shadowOffsetY")}
						</Label>
						<div className="flex items-center gap-1">
							<NumericDragInput
								value={String(shadow.offsetY)}
								onChange={(value) => handleShadowValueInput("offsetY", value)}
								min={-100}
								max={100}
								className="h-6 w-14 rounded-md px-1 text-right text-xs"
								aria-label={t("stylePanel.shadowOffsetY")}
							/>
							<span className="text-xs text-muted-foreground">px</span>
						</div>
					</div>
					<Slider
						value={[shadow.offsetY]}
						onValueChange={handleOffsetYChange}
						min={-100}
						max={100}
						step={1}
						className="w-full"
					/>
				</div>

				{/* Blur */}
				<div className="space-y-1.5">
					<div className="flex items-center justify-between">
						<Label className="text-[11px] font-medium leading-4 text-muted-foreground">
							{t("stylePanel.shadowBlur")}
						</Label>
						<div className="flex items-center gap-1">
							<NumericDragInput
								value={String(shadow.blur)}
								onChange={(value) => handleShadowValueInput("blur", value)}
								min={0}
								max={50}
								className="h-6 w-14 rounded-md px-1 text-right text-xs"
								aria-label={t("stylePanel.shadowBlur")}
							/>
							<span className="text-xs text-muted-foreground">px</span>
						</div>
					</div>
					<Slider
						value={[shadow.blur]}
						onValueChange={handleBlurChange}
						min={0}
						max={50}
						step={1}
						className="w-full"
					/>
				</div>

				{/* Spread */}
				<div className="space-y-1.5">
					<div className="flex items-center justify-between">
						<Label className="text-[11px] font-medium leading-4 text-muted-foreground">
							{t("stylePanel.shadowSpread")}
						</Label>
						<div className="flex items-center gap-1">
							<NumericDragInput
								value={String(shadow.spread)}
								onChange={(value) => handleShadowValueInput("spread", value)}
								min={-50}
								max={50}
								className="h-6 w-14 rounded-md px-1 text-right text-xs"
								aria-label={t("stylePanel.shadowSpread")}
							/>
							<span className="text-xs text-muted-foreground">px</span>
						</div>
					</div>
					<Slider
						value={[shadow.spread]}
						onValueChange={handleSpreadChange}
						min={-50}
						max={50}
						step={1}
						className="w-full"
					/>
				</div>

				{/* Color */}
				<div className="min-w-0 space-y-1.5">
					<Label className="text-[11px] font-medium leading-4 text-muted-foreground">
						{t("stylePanel.shadowColor")}
					</Label>
					<div className="flex gap-2">
						<Input
							type="color"
							value={hexColor}
							onChange={(e) => handleColorChange(e.target.value)}
							className="h-7 w-12 cursor-pointer rounded-md p-1"
						/>
						<Input
							type="text"
							value={shadow.color}
							onChange={(e) => handleColorChange(e.target.value)}
							placeholder={t("stylePanel.shadowColorPlaceholder")}
							className="h-7 min-w-0 flex-1 rounded-md font-mono text-xs"
						/>
					</div>
				</div>

				{/* Inset */}
				<div className="flex items-center space-x-2">
					<Checkbox
						id="shadow-inset"
						checked={shadow.inset}
						onCheckedChange={handleInsetChange}
					/>
					<Label htmlFor="shadow-inset" className="cursor-pointer text-xs font-normal">
						{t("stylePanel.shadowInset")}
					</Label>
				</div>
			</div>

			{/* Opacity */}

			<div className="space-y-2">
				<h5 className="text-xs font-semibold leading-4 text-foreground">
					{t("stylePanel.opacity")}
				</h5>

				<div className="space-y-1.5">
					<div className="flex items-center justify-between">
						<Label className="text-[11px] font-medium leading-4 text-muted-foreground">
							{t("stylePanel.transparency")}
						</Label>
						<NumericDragInput
							value={opacity.toFixed(2)}
							onChange={handleOpacityInputChange}
							min={0}
							max={1}
							step={0.01}
							precision={2}
							className="h-7 w-16 rounded-md text-xs"
							aria-label={t("stylePanel.transparency")}
						/>
					</div>
					<Slider
						value={[opacity]}
						onValueChange={handleOpacityChange}
						min={0}
						max={1}
						step={0.01}
						className="w-full"
					/>
				</div>
			</div>
		</div>
	)
})

export default ShadowSection
