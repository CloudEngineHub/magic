import type { ReactNode } from "react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { MoreHorizontal } from "lucide-react"
import { Button } from "@/components/shadcn-ui/button"
import { Popover, PopoverTrigger } from "@/components/shadcn-ui/popover"
import { ScrollArea } from "@/components/shadcn-ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/shadcn-ui/tabs"
import type { SelectedElementInfo } from "../types"
import type { HTMLEditorV2Ref } from "../../../iframe-bridge/types/props"
import { useStylePanelStore } from "../../../iframe-bridge/contexts/StylePanelContext"
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
}: ContextMorePopoverProps) {
	const { t } = useTranslation("super")
	const stylePanelStore = useStylePanelStore()
	const [open, setOpen] = useState(false)
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

	function handleTabChange(value: string) {
		setTab(value)
		if (selector) stylePanelStore.rememberMoreStylesTab(selector, value)
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
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
				sideOffset={8}
				collisionPadding={8}
				className="grid h-[min(30rem,calc(100vh-1rem))] min-h-0 w-[min(22rem,calc(100vw-1rem))] max-w-[calc(100vw-1rem)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-1.5"
				data-testid="style-panel-more-styles-content"
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
