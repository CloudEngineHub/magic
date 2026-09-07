import type { ReactNode } from "react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { MoreHorizontal } from "lucide-react"
import { Button } from "@/components/shadcn-ui/button"
import { Popover, PopoverTrigger } from "@/components/shadcn-ui/popover"
import { ScrollArea } from "@/components/shadcn-ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/shadcn-ui/tabs"
import type { SelectedElementInfo } from "../types"
import type { HTMLEditorV2Ref } from "../../../iframe-bridge/types/props"
import type { ElementRect } from "../../SelectionOverlay/types"
import { useStylePanelStore } from "../../../iframe-bridge/contexts/StylePanelContext"
import {
	getMoreStylesPanelSize,
	getMoreStylesPopoverLayout,
	getMoreStylesViewport,
	type MoreStylesPopoverLayout,
} from "../utils/moreStylesPopoverPosition"
import BoxModelSection from "../sections/BoxModelSection"
import FlexGridSection from "../sections/FlexGridSection"
import ImageSection from "../sections/ImageSection"
import { AnchorSection } from "../sections/AnchorSection"
import BackgroundSection from "../sections/BackgroundSection"
import BorderSection from "../sections/BorderSection"
import ShadowSection from "../sections/ShadowSection"
import { CustomCSSSection } from "../sections/CustomCSSSection"
import { STYLE_PANEL_STYLES } from "../styles"
import { EditorPopoverContent } from "../../EditorFloating"

interface ContextMorePopoverProps {
	selectedElement: SelectedElementInfo | null
	editorRef: React.RefObject<HTMLEditorV2Ref>
	disabled: boolean
	showTypography: boolean
	showFlexGrid: boolean
	showImage: boolean
	showBackground: boolean
	showBorder: boolean
	showShadow: boolean
	isLink: boolean
	fontFamilySelector: ReactNode
	textContentField: ReactNode
	onStyleChange: (property: string, value: string) => void
	onBatchStyleChange: (styles: Record<string, string>) => void
	onUpdateAttributes: (attributes: Record<string, string | null>) => Promise<void>
	/** Selected element box. The panel stays outside this rect. */
	selectionRect?: ElementRect | null
	/** Canvas bounds used to keep the panel in the visible editor area. */
	boundaryRef?: React.RefObject<HTMLElement | null>
}

/**
 * One secondary panel keeps the contextual toolbar compact. Tabs keep each
 * style family independent without stacking several nested popovers.
 */
export function ContextMorePopover({
	selectedElement,
	editorRef,
	disabled,
	showTypography,
	showFlexGrid,
	showImage,
	showBackground,
	showBorder,
	showShadow,
	isLink,
	fontFamilySelector,
	textContentField,
	onStyleChange,
	onBatchStyleChange,
	onUpdateAttributes,
	selectionRect,
	boundaryRef,
}: ContextMorePopoverProps) {
	const { t } = useTranslation("super")
	const stylePanelStore = useStylePanelStore()
	const triggerRef = useRef<HTMLButtonElement>(null)
	const [open, setOpen] = useState(false)
	const [layout, setLayout] = useState<MoreStylesPopoverLayout>({
		left: 0,
		top: 0,
		width: 352,
		height: 480,
		maxHeight: 480,
		side: "right",
	})
	const firstTab =
		showTypography || isLink
			? "text"
			: showImage
				? "image"
				: showBackground
					? "background"
					: showBorder
						? "border"
						: showShadow
							? "shadow"
							: "layout"
	const tabs = [
		...(showTypography || isLink ? [{ value: "text", label: t("stylePanel.text") }] : []),
		...(showBackground ? [{ value: "background", label: t("stylePanel.background") }] : []),
		...(showBorder ? [{ value: "border", label: t("stylePanel.border") }] : []),
		...(showShadow ? [{ value: "shadow", label: t("stylePanel.shadow") }] : []),
		...(showImage ? [{ value: "image", label: t("stylePanel.imageSettings") }] : []),
		{ value: "layout", label: t("stylePanel.layout") },
		{ value: "advanced", label: t("stylePanel.customCSS.title") },
	]
	const availableTabs = tabs.map((item) => item.value)
	const selector = selectedElement?.selector
	const resolvedTab = resolveMoreStylesTab(
		selector ? stylePanelStore.getMoreStylesTab(selector) : undefined,
		firstTab,
		availableTabs,
	)
	const [tab, setTab] = useState(resolvedTab)

	useEffect(() => {
		setTab(resolvedTab)
	}, [resolvedTab])

	const selectionLeft = selectionRect?.left
	const selectionTop = selectionRect?.top
	const selectionWidth = selectionRect?.width
	const selectionHeight = selectionRect?.height
	useLayoutEffect(() => {
		if (!open) return
		if (
			selectionLeft == null ||
			selectionTop == null ||
			selectionWidth == null ||
			selectionHeight == null
		) {
			return
		}
		const rect = {
			left: selectionLeft,
			top: selectionTop,
			width: selectionWidth,
			height: selectionHeight,
		}
		function updateLayout() {
			const trigger = triggerRef.current?.getBoundingClientRect()
			if (!trigger || trigger.width <= 0 || trigger.height <= 0) return
			const boundary = boundaryRef?.current?.getBoundingClientRect()
			const viewport = getMoreStylesViewport(boundary)
			const next = getMoreStylesPopoverLayout(
				{
					left: trigger.left,
					top: trigger.top,
					width: trigger.width,
					height: trigger.height,
				},
				rect,
				viewport,
				getMoreStylesPanelSize(viewport),
			)
			setLayout((previous) =>
				previous.left === next.left &&
				previous.top === next.top &&
				previous.width === next.width &&
				previous.height === next.height &&
				previous.side === next.side
					? previous
					: next,
			)
		}
		updateLayout()
		window.addEventListener("resize", updateLayout)
		window.addEventListener("scroll", updateLayout, true)
		const resizeObserver =
			typeof ResizeObserver === "undefined" || !boundaryRef?.current
				? null
				: new ResizeObserver(updateLayout)
		if (boundaryRef?.current) resizeObserver?.observe(boundaryRef.current)
		return () => {
			window.removeEventListener("resize", updateLayout)
			window.removeEventListener("scroll", updateLayout, true)
			resizeObserver?.disconnect()
		}
	}, [boundaryRef, open, selectionHeight, selectionLeft, selectionTop, selectionWidth])

	useLayoutEffect(() => {
		if (!open) return
		let observer: MutationObserver | null = null
		let raf = 0
		function neutralizeParentTransform(node: HTMLElement) {
			const parent = node.parentElement
			if (!parent || parent === document.body) return
			if (getComputedStyle(parent).transform === "none") return
			parent.style.setProperty("transform", "none", "important")
		}
		function applyFixedLayout(node: HTMLElement) {
			neutralizeParentTransform(node)
			const next = {
				position: "fixed",
				left: `${layout.left}px`,
				top: `${layout.top}px`,
				width: `${layout.width}px`,
				height: `${layout.height}px`,
				maxHeight: `${layout.maxHeight}px`,
				transform: "none",
			}
			if (
				node.style.getPropertyValue("position") === next.position &&
				node.style.getPropertyValue("left") === next.left &&
				node.style.getPropertyValue("top") === next.top &&
				node.style.getPropertyValue("width") === next.width &&
				node.style.getPropertyValue("height") === next.height &&
				node.style.getPropertyValue("max-height") === next.maxHeight &&
				node.style.getPropertyValue("transform") === next.transform
			) {
				return
			}
			node.style.setProperty("position", next.position, "important")
			node.style.setProperty("left", next.left, "important")
			node.style.setProperty("top", next.top, "important")
			node.style.setProperty("width", next.width, "important")
			node.style.setProperty("height", next.height, "important")
			node.style.setProperty("max-height", next.maxHeight, "important")
			node.style.setProperty("transform", next.transform, "important")
		}
		function attach() {
			const node = document.querySelector<HTMLElement>(
				'[data-testid="style-panel-more-styles-content"]',
			)
			if (!node) {
				raf = requestAnimationFrame(attach)
				return
			}
			applyFixedLayout(node)
			observer = new MutationObserver(() => applyFixedLayout(node))
			observer.observe(node, { attributes: true, attributeFilter: ["style"] })
			if (node.parentElement) {
				observer.observe(node.parentElement, {
					attributes: true,
					attributeFilter: ["style"],
				})
			}
		}
		attach()
		return () => {
			cancelAnimationFrame(raf)
			observer?.disconnect()
		}
	}, [layout, open])

	function handleTabChange(value: string) {
		setTab(value)
		if (selector) stylePanelStore.rememberMoreStylesTab(selector, value)
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					ref={triggerRef}
					variant="ghost"
					size="sm"
					className={`h-7 shrink-0 gap-1 px-2 ${STYLE_PANEL_STYLES.toolbarButton}`}
					disabled={disabled}
					aria-label={t("stylePanel.moreStyles")}
					data-testid="style-panel-more-styles-trigger"
				>
					<MoreHorizontal className="h-4 w-4" />
					<span className="text-xs font-normal">{t("stylePanel.moreStyles")}</span>
				</Button>
			</PopoverTrigger>
			<EditorPopoverContent
				side="bottom"
				align="start"
				sideOffset={0}
				alignOffset={0}
				avoidCollisions={false}
				style={{
					position: "fixed",
					left: layout.left,
					top: layout.top,
					width: layout.width,
					height: layout.height,
					maxHeight: layout.maxHeight,
					transform: "none",
				}}
				className="grid min-h-0 !transform-none grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-1.5"
				data-testid="style-panel-more-styles-content"
				data-side={layout.side}
			>
				<Tabs
					value={tab}
					onValueChange={handleTabChange}
					className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] gap-1.5"
				>
					<ScrollArea
						type="auto"
						scrollbarOrientation="horizontal"
						className="w-full shrink-0 whitespace-nowrap"
						viewportClassName="max-w-full overflow-x-auto overflow-y-hidden"
						data-testid="style-panel-more-tabs-scroll-area"
					>
						<TabsList className="h-7 w-max min-w-full justify-start rounded-md bg-muted/60 p-0.5">
							{tabs.map((item) => (
								<TabsTrigger
									key={item.value}
									value={item.value}
									className="h-6 px-2 text-[11px]"
									data-testid={`style-panel-more-${item.value}-tab`}
								>
									{item.label}
								</TabsTrigger>
							))}
						</TabsList>
					</ScrollArea>
					<div className="min-h-0 min-w-0 overflow-hidden">
						<ScrollArea
							type="auto"
							className="h-full max-h-full min-h-0"
							viewportClassName="h-full min-h-0 overflow-y-auto pr-4"
							data-testid="style-panel-more-content-scroll-area"
						>
							<TabsContent
								value="text"
								className="mt-0 space-y-2"
								data-testid="style-panel-more-text"
							>
								{fontFamilySelector}
								{textContentField}
								{isLink && selectedElement ? (
									<AnchorSection
										selectedElement={selectedElement}
										disabled={disabled}
										onUpdate={onUpdateAttributes}
									/>
								) : null}
							</TabsContent>
							<TabsContent
								value="layout"
								className="mt-0 space-y-2"
								data-testid="style-panel-more-layout"
							>
								<BoxModelSection
									selectedElement={selectedElement}
									editorRef={editorRef}
									onStyleChange={onStyleChange}
								/>
								{showFlexGrid ? (
									<FlexGridSection
										selectedElement={selectedElement}
										editorRef={editorRef}
										onStyleChange={onStyleChange}
									/>
								) : null}
							</TabsContent>
							<TabsContent
								value="background"
								className="mt-0 space-y-2"
								data-testid="style-panel-more-background"
							>
								<BackgroundSection
									selectedElement={selectedElement}
									editorRef={editorRef}
									onStyleChange={onStyleChange}
								/>
							</TabsContent>
							<TabsContent
								value="border"
								className="mt-0 space-y-2"
								data-testid="style-panel-more-border"
							>
								<BorderSection
									selectedElement={selectedElement}
									editorRef={editorRef}
									onStyleChange={onStyleChange}
								/>
							</TabsContent>
							<TabsContent
								value="shadow"
								className="mt-0 space-y-2"
								data-testid="style-panel-more-shadow"
							>
								<ShadowSection
									selectedElement={selectedElement}
									editorRef={editorRef}
									onStyleChange={onStyleChange}
								/>
							</TabsContent>
							<TabsContent
								value="image"
								className="mt-0 space-y-2"
								data-testid="style-panel-more-image"
							>
								<ImageSection
									selectedElement={selectedElement}
									editorRef={editorRef}
									onStyleChange={onStyleChange}
								/>
							</TabsContent>
							<TabsContent
								value="advanced"
								className="mt-0 space-y-2"
								data-testid="style-panel-more-advanced"
							>
								<CustomCSSSection
									selectedElement={selectedElement}
									disabled={disabled}
									onApply={onBatchStyleChange}
								/>
							</TabsContent>
						</ScrollArea>
					</div>
				</Tabs>
			</EditorPopoverContent>
		</Popover>
	)
}

function resolveMoreStylesTab(
	cachedTab: string | undefined,
	firstTab: string,
	availableTabs: string[],
) {
	if (cachedTab && availableTabs.includes(cachedTab)) return cachedTab
	return firstTab
}
