import { observer } from "mobx-react-lite"
import { useCallback, useEffect, useState } from "react"
import { useDebounceFn } from "ahooks"
import { useTranslation } from "react-i18next"
import { DimensionInput, NumericDragInput } from "../controls"
import type { StyleSectionProps } from "../types"
import { formatUsedSizeLabel, getDimensionField } from "../utils/dimensionValue"

type BoxSide = "top" | "right" | "bottom" | "left"
type BoxValues = Record<BoxSide, string>

function parseBox(value: string | undefined): BoxValues {
	const values = (value || "0px")
		.trim()
		.split(/\s+/)
		.map((item) => item.replace(/px$/i, ""))
		.filter(Boolean)

	if (values.length === 1) {
		return { top: values[0], right: values[0], bottom: values[0], left: values[0] }
	}
	if (values.length === 2) {
		return { top: values[0], right: values[1], bottom: values[0], left: values[1] }
	}
	if (values.length === 3) {
		return { top: values[0], right: values[1], bottom: values[2], left: values[1] }
	}
	if (values.length >= 4) {
		return { top: values[0], right: values[1], bottom: values[2], left: values[3] }
	}
	return { top: "0", right: "0", bottom: "0", left: "0" }
}

function formatBox(values: BoxValues) {
	return `${values.top}px ${values.right}px ${values.bottom}px ${values.left}px`
}

interface EdgeInputProps {
	label: string
	value: string
	onChange: (value: string) => void
}

function EdgeInput({ label, value, onChange }: EdgeInputProps) {
	return (
		<NumericDragInput
			value={value}
			onChange={onChange}
			inputMode="decimal"
			className="h-5 w-8 rounded-none border border-transparent bg-transparent px-0.5 text-center text-[11px] tabular-nums text-foreground shadow-none outline-none transition-[background-color,border-color,color] duration-150 ease-out placeholder:text-muted-foreground/50 hover:border-primary/40 hover:text-primary focus-visible:border-primary focus-visible:text-primary disabled:cursor-default"
			aria-label={label}
			data-testid={`box-model-edge-${label}`}
		/>
	)
}

interface BoxLayerProps {
	label: string
	values: BoxValues
	color: "margin" | "border" | "padding"
	center: React.ReactNode
	onChange?: (side: BoxSide, value: string) => void
	sideLabel: (side: BoxSide) => string
}

function BoxLayer({ label, values, color, center, onChange, sideLabel }: BoxLayerProps) {
	const palette = {
		margin: "border-border bg-muted/40",
		border: "border-border bg-background",
		padding: "border-border bg-muted/20",
	}[color]

	return (
		<div className={`group relative w-full min-w-0 rounded-none border p-1 ${palette}`}>
			{color === "margin" ? (
				<>
					<span className="pointer-events-none absolute -left-px -top-px h-2 w-2 border-l-[1.5px] border-t-[1.5px] border-foreground/55" />
					<span className="pointer-events-none absolute -right-px -top-px h-2 w-2 border-r-[1.5px] border-t-[1.5px] border-foreground/55" />
					<span className="pointer-events-none absolute -bottom-px -left-px h-2 w-2 border-b-[1.5px] border-l-[1.5px] border-foreground/55" />
					<span className="pointer-events-none absolute -bottom-px -right-px h-2 w-2 border-b-[1.5px] border-r-[1.5px] border-foreground/55" />
				</>
			) : null}
			<div className="pointer-events-none absolute left-1 top-0.5 max-w-[calc(100%-3rem)] truncate text-[10px] font-medium text-muted-foreground">
				{label}
			</div>
			<div className="grid w-full min-w-0 grid-cols-[1.5rem_minmax(0,1fr)_1.5rem] grid-rows-[1.15rem_minmax(2rem,auto)_1.15rem]">
				{onChange && (
					<>
						<div className="col-start-2 row-start-1 flex items-center justify-center">
							<EdgeInput
								label={sideLabel("top")}
								value={values.top}
								onChange={(value) => onChange("top", value)}
							/>
						</div>
						<div className="col-start-1 row-start-2 flex items-center justify-center">
							<EdgeInput
								label={sideLabel("left")}
								value={values.left}
								onChange={(value) => onChange("left", value)}
							/>
						</div>
						<div className="col-start-3 row-start-2 flex items-center justify-center">
							<EdgeInput
								label={sideLabel("right")}
								value={values.right}
								onChange={(value) => onChange("right", value)}
							/>
						</div>
						<div className="col-start-2 row-start-3 flex items-center justify-center">
							<EdgeInput
								label={sideLabel("bottom")}
								value={values.bottom}
								onChange={(value) => onChange("bottom", value)}
							/>
						</div>
					</>
				)}
				<div className="col-start-2 row-start-2 flex min-h-0 w-full min-w-0 items-center justify-center">
					{center}
				</div>
			</div>
		</div>
	)
}

const BoxModelSection = observer(function BoxModelSection({
	selectedElement,
	onStyleChange,
}: StyleSectionProps) {
	const { t } = useTranslation("super")
	const computedStyles = selectedElement?.computedStyles
	const [margin, setMargin] = useState(() => parseBox(computedStyles?.margin))
	const [border, setBorder] = useState(() => parseBox(computedStyles?.borderWidth))
	const [padding, setPadding] = useState(() => parseBox(computedStyles?.padding))

	useEffect(() => {
		setMargin(parseBox(computedStyles?.margin))
		setBorder(parseBox(computedStyles?.borderWidth))
		setPadding(parseBox(computedStyles?.padding))
	}, [
		computedStyles?.borderWidth,
		computedStyles?.margin,
		computedStyles?.padding,
		selectedElement?.selector,
	])

	const { run: applyBoxChange } = useDebounceFn(
		(property: "margin" | "padding" | "borderWidth", values: BoxValues) => {
			onStyleChange?.(property, formatBox(values))
		},
		{ wait: 250 },
	)

	const updateBox = useCallback(
		(property: "margin" | "padding" | "borderWidth", side: BoxSide, value: string) => {
			if (value !== "" && !/^-?\d*(?:\.\d*)?$/.test(value)) return
			if (
				property === "borderWidth" &&
				Number.parseFloat(value) > 0 &&
				(computedStyles?.borderStyle || "none") === "none"
			) {
				onStyleChange?.("borderStyle", "solid")
			}
			const setter =
				property === "margin" ? setMargin : property === "padding" ? setPadding : setBorder
			setter((previous) => {
				const next = { ...previous, [side]: value || "0" }
				applyBoxChange(property, next)
				return next
			})
		},
		[applyBoxChange, computedStyles?.borderStyle, onStyleChange],
	)

	const width = getDimensionField(selectedElement, "width")
	const height = getDimensionField(selectedElement, "height")
	const borderWidth = computedStyles?.borderWidth || "0px"
	const usedWidth = formatUsedSizeLabel(computedStyles?.width)
	const usedHeight = formatUsedSizeLabel(computedStyles?.height)
	const dimensions = `${usedWidth} × ${usedHeight}`
	const getSideLabel = useCallback(
		(layer: string, side: BoxSide) =>
			t("stylePanel.boxModelSideLabel", {
				layer,
				side: t(`stylePanel.boxModelSide.${side}`),
			}),
		[t],
	)
	const marginLabel = t("stylePanel.margin")
	const borderLabel = t("stylePanel.border")
	const paddingLabel = t("stylePanel.padding")

	return (
		<div className="min-w-0 space-y-2" data-testid="html-style-panel-box-model">
			<div className="grid min-w-0 grid-cols-2 gap-2 [&>*]:min-w-0">
				<DimensionInput
					key={`${selectedElement?.selector ?? "none"}-width`}
					label={t("stylePanel.width")}
					value={width.value}
					onChange={(value) => onStyleChange?.("width", value)}
					placeholder="auto"
					id="html-style-panel-box-width"
					compact
					pixelValue={computedStyles?.width}
					valueFromInline={width.fromInline}
				/>
				<DimensionInput
					key={`${selectedElement?.selector ?? "none"}-height`}
					label={t("stylePanel.height")}
					value={height.value}
					onChange={(value) => onStyleChange?.("height", value)}
					placeholder="auto"
					id="html-style-panel-box-height"
					compact
					pixelValue={computedStyles?.height}
					valueFromInline={height.fromInline}
				/>
			</div>

			<BoxLayer
				label={marginLabel}
				values={margin}
				color="margin"
				sideLabel={(side) => getSideLabel(marginLabel, side)}
				onChange={(side, value) => updateBox("margin", side, value)}
				center={
					<BoxLayer
						label={t("stylePanel.boxModelLayer", {
							label: borderLabel,
							value: borderWidth,
						})}
						values={border}
						color="border"
						sideLabel={(side) => getSideLabel(borderLabel, side)}
						onChange={(side, value) => updateBox("borderWidth", side, value)}
						center={
							<BoxLayer
								label={paddingLabel}
								values={padding}
								color="padding"
								sideLabel={(side) => getSideLabel(paddingLabel, side)}
								onChange={(side, value) => updateBox("padding", side, value)}
								center={
									<div
										className="flex min-h-8 w-full min-w-0 items-center justify-center border border-dashed border-border bg-background px-1 py-1 text-center text-[11px] tabular-nums leading-tight text-foreground"
										data-testid="html-style-panel-box-model-content"
									>
										<span className="flex min-w-0 flex-wrap items-center justify-center gap-x-1">
											{dimensions ? (
												<>
													<span>{usedWidth}</span>
													<span>×</span>
													<span>{usedHeight}</span>
												</>
											) : (
												t("stylePanel.boxModelContent")
											)}
										</span>
									</div>
								}
							/>
						}
					/>
				}
			/>
		</div>
	)
})

export default BoxModelSection
