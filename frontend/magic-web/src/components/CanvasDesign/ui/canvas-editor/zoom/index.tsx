import { useCallback, useEffect, useMemo, useState } from "react"
import { Minus, Plus } from "lucide-react"
import { useCanvas } from "../../../app/providers/CanvasProvider"
import { useCanvasEvent } from "../../../app/hooks/canvas"
import { useCanvasDesignI18n } from "../../../app/providers/I18nProvider"
import { Divider, type ShortcutDisplay } from "../../../public/props"
import {
	fromAbsolutePercent,
	getZoomView,
} from "../../../runtime/interaction/viewport/viewport-zoom"
import { formatShortcut, getShortcutDisplay } from "../../../runtime/shared/lib/index"
import IconButton from "../../primitives/custom/IconButton/index"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectSeparator,
	SelectTrigger,
} from "../../primitives/shadcn/select"

import styles from "./index.module.css"

type ZoomOption = {
	value: string
	label: string
	shortcut?: ShortcutDisplay | null
	onSelect: () => void
}

/** 只负责缩放操作和缩放比例展示；右下角定位由 ViewportControls 统一管理。 */
export default function Zoom() {
	const { t } = useCanvasDesignI18n()
	const { canvas } = useCanvas()
	const [displayZoom, setDisplayZoom] = useState(100)

	const syncDisplayZoom = useCallback(() => {
		if (!canvas) {
			setDisplayZoom(100)
			return
		}

		const { absolutePercent } = getZoomView({
			rawScale: canvas.viewportController.getScale(),
			fitScale: canvas.viewportController.getFitToScreenScale(),
		})
		setDisplayZoom(absolutePercent)
	}, [canvas])

	useCanvasEvent(
		"viewport:scale",
		() => {
			syncDisplayZoom()
		},
		[syncDisplayZoom],
	)

	// 当 canvas 初始化时，同步当前的 scale 值，避免错过 loadViewport 的早期事件。
	useEffect(() => {
		syncDisplayZoom()
	}, [syncDisplayZoom])

	const handleZoomIn = useCallback(() => {
		if (!canvas) return
		canvas.userActionRegistry.execute("view.zoom-in")
	}, [canvas])

	const handleZoomOut = useCallback(() => {
		if (!canvas) return
		canvas.userActionRegistry.execute("view.zoom-out")
	}, [canvas])

	const handleZoomToFit = useCallback(() => {
		if (!canvas) return
		canvas.userActionRegistry.execute("view.zoom-fit")
	}, [canvas])

	const handleZoomToAbsoluteScale = useCallback(
		(percent: number) => {
			if (!canvas) return
			canvas.viewportController.setScale(fromAbsolutePercent(percent))
		},
		[canvas],
	)

	const options = useMemo<Array<ZoomOption | typeof Divider>>(() => {
		return [
			{
				value: "zoom-in",
				label: t("zoom.zoomIn", "放大"),
				shortcut: getShortcutDisplay("view.zoom-in"),
				onSelect: handleZoomIn,
			},
			{
				value: "zoom-out",
				label: t("zoom.zoomOut", "缩小"),
				shortcut: getShortcutDisplay("view.zoom-out"),
				onSelect: handleZoomOut,
			},
			{
				value: "fit",
				label: t("zoom.fitToScreen", "适配屏幕"),
				shortcut: getShortcutDisplay("view.zoom-fit"),
				onSelect: handleZoomToFit,
			},
			Divider,
			{
				value: "50",
				label: t("zoom.zoomTo", { percent: 50, defaultValue: "缩放至50%" }),
				onSelect: () => handleZoomToAbsoluteScale(50),
			},
			{
				value: "75",
				label: t("zoom.zoomTo", { percent: 75, defaultValue: "缩放至75%" }),
				onSelect: () => handleZoomToAbsoluteScale(75),
			},
			{
				value: "100",
				label: t("zoom.zoomTo", { percent: 100, defaultValue: "缩放至100%" }),
				onSelect: () => handleZoomToAbsoluteScale(100),
			},
			{
				value: "200",
				label: t("zoom.zoomTo", { percent: 200, defaultValue: "缩放至200%" }),
				onSelect: () => handleZoomToAbsoluteScale(200),
			},
		]
	}, [t, handleZoomIn, handleZoomOut, handleZoomToFit, handleZoomToAbsoluteScale])

	const handleValueChange = useCallback(
		(value: string) => {
			const option = options.find(
				(opt): opt is ZoomOption =>
					typeof opt === "object" && "value" in opt && opt.value === value,
			)
			option?.onSelect()
		},
		[options],
	)

	return (
		<div className={styles.zoom} data-canvas-ui-component>
			<IconButton className={styles.zoomOut} onClick={handleZoomOut}>
				<Minus size={16} />
			</IconButton>
			<Select value="" onValueChange={handleValueChange}>
				<SelectTrigger className={styles.selectTrigger}>
					<span className={styles.zoomValue}>{displayZoom}%</span>
				</SelectTrigger>
				<SelectContent side="top" align="end" style={{ width: 200 }}>
					{options.map((option, index) => {
						if (option === Divider) {
							return <SelectSeparator key={`separator-${index}`} />
						}
						return (
							<SelectItem
								key={option.value}
								value={option.value}
								className={styles.selectItem}
							>
								<div className={styles.selectItemContent}>
									<span className={styles.label}>{option.label}</span>
									{option.shortcut ? (
										<div className={styles.shortcut}>
											{option.shortcut.modifiers?.map((modifier) => (
												<div key={modifier} className={styles.key}>
													{formatShortcut(modifier)}
												</div>
											))}
											<div className={styles.key}>{option.shortcut.key}</div>
										</div>
									) : null}
								</div>
							</SelectItem>
						)
					})}
				</SelectContent>
			</Select>
			<IconButton className={styles.zoomIn} onClick={handleZoomIn}>
				<Plus size={16} />
			</IconButton>
		</div>
	)
}
