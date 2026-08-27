import { observer } from "mobx-react-lite"
import { useCallback, useEffect, useState } from "react"
import { useDebounceFn } from "ahooks"
import { useTranslation } from "react-i18next"
import { DimensionInput, NumericDragInput } from "../controls"
import type { StyleSectionProps } from "../types"
import { STYLE_PANEL_STYLES } from "../styles"

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
			className="h-5 w-9 rounded-sm border border-transparent bg-transparent px-0.5 text-center font-mono text-[10px] tabular-nums text-foreground shadow-none outline-none transition-[background-color,border-color,box-shadow,color] duration-150 ease-out placeholder:text-muted-foreground/50 hover:border-primary/35 hover:bg-primary/5 hover:text-primary focus-visible:border-primary/70 focus-visible:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-default"
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
		margin: "border-amber-300/70 bg-amber-50/70 dark:border-amber-700/70 dark:bg-amber-950/20",
		border: "border-slate-300/80 bg-slate-50/90 dark:border-slate-600/80 dark:bg-slate-900/40",
		padding: "border-sky-300/80 bg-sky-100/70 dark:border-sky-700/80 dark:bg-sky-950/30",
	}[color]

	return (
		<div
			className={`group relative min-w-0 border p-1 transition-[background-color,border-color,box-shadow] duration-150 ease-out hover:shadow-[inset_0_0_0_1px_hsl(var(--foreground)/0.08)] ${palette}`.trim()}
		>
			<div className="pointer-events-none absolute left-1 top-0.5 max-w-[calc(100%-3rem)] truncate text-[9px] font-medium uppercase tracking-[0.04em] text-muted-foreground">
				{label}
			</div>
			<div className="grid min-w-0 grid-cols-[1.75rem_minmax(0,1fr)_1.75rem] grid-rows-[1.15rem_minmax(2rem,auto)_1.15rem]">
				{onChange && (
					<>
						<div className="group/edge col-start-2 row-start-1 flex items-center justify-center rounded-sm transition-colors hover:bg-background/35">
							<EdgeInput
								label={sideLabel("top")}
								value={values.top}
								onChange={(value) => onChange("top", value)}
							/>
						</div>
						<div className="group/edge col-start-1 row-start-2 flex items-center justify-center rounded-sm transition-colors hover:bg-background/35">
							<EdgeInput
								label={sideLabel("left")}
								value={values.left}
								onChange={(value) => onChange("left", value)}
							/>
						</div>
						<div className="group/edge col-start-3 row-start-2 flex items-center justify-center rounded-sm transition-colors hover:bg-background/35">
							<EdgeInput
								label={sideLabel("right")}
								value={values.right}
								onChange={(value) => onChange("right", value)}
							/>
						</div>
						<div className="group/edge col-start-2 row-start-3 flex items-center justify-center rounded-sm transition-colors hover:bg-background/35">
							<EdgeInput
								label={sideLabel("bottom")}
								value={values.bottom}
								onChange={(value) => onChange("bottom", value)}
							/>
						</div>
					</>
				)}
				<div className="col-start-2 row-start-2 min-w-0">{center}</div>
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

	const width = computedStyles?.width || "auto"
	const height = computedStyles?.height || "auto"
	const borderWidth = computedStyles?.borderWidth || "0px"
	const dimensions = `${width} × ${height}`
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
			<div className={STYLE_PANEL_STYLES.subsectionTitle}>
				<div className="truncate text-[11px] font-semibold">
					{t("stylePanel.layoutStyles")}
				</div>
				<div className="shrink-0 text-[9px] text-muted-foreground/80">
					{t("stylePanel.boxModel")}
				</div>
			</div>
			<div className="grid min-w-0 grid-cols-2 gap-2 [&>*]:min-w-0">
				<DimensionInput
					label={t("stylePanel.width")}
					value={width}
					onChange={(value) => onStyleChange?.("width", value)}
					placeholder="auto"
					id="html-style-panel-box-width"
					compact
				/>
				<DimensionInput
					label={t("stylePanel.height")}
					value={height}
					onChange={(value) => onStyleChange?.("height", value)}
					placeholder="auto"
					id="html-style-panel-box-height"
					compact
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
									<div className="min-h-8 border border-dashed border-foreground/60 bg-card px-1 py-1 text-center text-[10px] font-medium tabular-nums leading-tight text-foreground transition-[background-color,border-color,box-shadow] duration-150 hover:border-primary/70 hover:bg-primary/5">
										{dimensions || t("stylePanel.boxModelContent")}
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
