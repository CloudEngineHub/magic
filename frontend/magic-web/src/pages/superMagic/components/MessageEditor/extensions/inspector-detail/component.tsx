import { Fragment, useCallback, useState, type MouseEvent } from "react"
import { NodeViewWrapper } from "@/infrastructure/editors/tiptap/react"
import type { NodeViewProps } from "@/infrastructure/editors/tiptap/react"
import { ChevronRight, ChevronDown, Crosshair } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/utils/cn"
import {
	MentionItemType,
	type ProjectFileMentionData,
} from "@/components/business/MentionPanel/types"
import type { InspectorDetailAttrs } from "./types"
import { INSPECTOR_DETAIL_COLLAPSED_MAX_WIDTH_CLASS } from "./const"
import { getInspectorDetailHeaderLabel } from "./display"
import { InspectorScreenshotPreview } from "./InspectorScreenshotPreview"
import { useHtmlScreenshotMention } from "../../hooks/useHtmlScreenshotMention"

export const InspectorDetailComponent: React.FC<NodeViewProps> = ({
	node,
	selected,
	editor,
	getPos,
}) => {
	const attrs = node.attrs as InspectorDetailAttrs
	const [expanded, setExpanded] = useState(false)
	const { t } = useTranslation("super")
	const screenshotMention = useHtmlScreenshotMention(attrs.captureId, attrs.screenshotMention)

	const parsedStyles: Record<string, string> = (() => {
		try {
			return JSON.parse(attrs.computedStyles || "{}")
		} catch {
			return {}
		}
	})()
	const styleEntries = Object.entries(parsedStyles)
	const parsedAttributes: Record<string, string> = (() => {
		try {
			return JSON.parse(attrs.elementAttributes || "{}")
		} catch {
			return {}
		}
	})()
	const parsedDomContext: {
		parentSelector?: string
		siblingIndex?: number
		sameTagSiblingCount?: number
		sameTagIndex?: number
		previousSibling?: string
		nextSibling?: string
	} = (() => {
		try {
			return JSON.parse(attrs.domContext || "{}")
		} catch {
			return {}
		}
	})()
	const attributeEntries = Object.entries(parsedAttributes)

	const handleMouseDown = useCallback((event: MouseEvent) => {
		// Keep pointer drag from becoming a native text/image drag.
		event.preventDefault()
		event.stopPropagation()
	}, [])

	const headerLabel = getInspectorDetailHeaderLabel(t, attrs.textContent, attrs.tagName)
	const fileData =
		attrs.fileMention?.type === MentionItemType.PROJECT_FILE
			? (attrs.fileMention.data as ProjectFileMentionData)
			: null

	const headerLabelContent = (
		<>
			<Crosshair size={12} className="flex-shrink-0 text-primary" data-drag-preview-icon />
			<span className="min-w-0 flex-1 truncate text-[inherit]">{headerLabel}</span>
		</>
	)
	const expandIcon = expanded ? (
		<ChevronDown size={12} className="flex-shrink-0 text-primary/70" />
	) : (
		<ChevronRight size={12} className="flex-shrink-0 text-primary/70" />
	)
	const headerButton = (
		<button
			type="button"
			className={cn(
				"inline-flex max-w-full cursor-pointer items-center gap-1 text-left font-[inherit] leading-[inherit] text-[inherit]",
				expanded ? "w-full" : "w-auto min-w-0",
				!expanded &&
					"h-5 rounded-md border border-border/60 bg-muted/30 px-1.5 text-xs leading-5",
				// Highlight the existing chip surface instead of adding an outer ring that changes its visual weight.
				selected && !expanded && "border-primary/70 bg-primary/10",
				expanded &&
					"border-b border-primary/20 px-1 py-0.5 text-xs font-normal leading-5 text-primary",
			)}
			onClick={() => {
				editor.commands.setNodeSelection(getPos())
				setExpanded((value) => !value)
			}}
			contentEditable={false}
			draggable={false}
			data-testid="set-expanded"
		>
			{/* Keep the preview on the label, not the expand button. */}
			{!expanded && screenshotMention ? (
				<InspectorScreenshotPreview
					mention={screenshotMention}
					trigger={
						<span className="inline-flex min-w-0 items-center gap-1">
							{headerLabelContent}
						</span>
					}
				/>
			) : (
				headerLabelContent
			)}
			{expandIcon}
		</button>
	)

	// 折叠态的视觉边框放在按钮上，保持与普通 @ 节点一致的水平间距。
	return (
		<NodeViewWrapper
			as="span"
			data-type="inspector-detail"
			draggable={false}
			data-magic-editor-node
			onMouseDown={handleMouseDown}
			className={cn(
				"cursor-grab select-none transition-colors active:cursor-grabbing",
				// Replace ProseMirror's generic node outline with the chip-level selected state below.
				selected && "!outline-none",
				expanded
					? cn(
							"my-1 block w-full rounded-md border border-primary/50 bg-primary/5",
							selected && "border-primary/70 bg-primary/10",
						)
					: cn(
							"magic-mention relative top-[1px] !inline-flex !overflow-visible !bg-transparent !p-0 !align-baseline",
							INSPECTOR_DETAIL_COLLAPSED_MAX_WIDTH_CLASS,
						),
			)}
		>
			{headerButton}

			{/* Expanded detail panel */}
			{expanded && (
				<span
					className="block space-y-1 px-2 py-1.5 text-[11px] text-foreground/70"
					contentEditable={false}
				>
					{screenshotMention && (
						<InspectorScreenshotPreview mention={screenshotMention} />
					)}
					{fileData && (
						<span className="flex gap-1.5">
							<span className="flex-shrink-0 text-foreground/50">
								{t("stylePanel.inspector.file")}
							</span>
							<span className="min-w-0 break-all text-primary">
								@{fileData.file_name}
							</span>
						</span>
					)}

					{/* Selector */}
					{attrs.selector && (
						<span className="flex gap-1.5">
							<span className="flex-shrink-0 text-foreground/50">
								{t("stylePanel.inspector.selector")}
							</span>
							<code className="min-w-0 break-all font-mono text-foreground/70">
								{attrs.selector}
							</code>
						</span>
					)}

					{/* Size */}
					{attrs.size && (
						<span className="flex gap-1.5">
							<span className="flex-shrink-0 text-foreground/50">
								{t("stylePanel.inspector.size")}
							</span>
							<span>{attrs.size}</span>
						</span>
					)}

					{/* Computed styles */}
					{styleEntries.length > 0 && (
						<span className="block">
							<span className="text-foreground/50">
								{t("stylePanel.inspector.computedStyles")}
							</span>
							<span className="mt-0.5 grid grid-cols-[auto_1fr] gap-x-1.5 gap-y-px rounded bg-muted/50 px-1.5 py-1 font-mono text-[11px]">
								{styleEntries.map(([prop, value]) => (
									<Fragment key={prop}>
										<span className="text-foreground/50">{prop}:</span>
										<span className="min-w-0 break-all text-foreground/70">
											{value}
										</span>
									</Fragment>
								))}
							</span>
						</span>
					)}

					{/* Resource and selector validation */}
					{(attrs.resource || attrs.selector) && (
						<span className="block space-y-1">
							{attrs.resource && (
								<span className="flex gap-1.5">
									<span className="flex-shrink-0 text-foreground/50">
										{t("stylePanel.inspector.resource")}
									</span>
									<code className="min-w-0 break-all font-mono text-foreground/70">
										{attrs.resource}
									</code>
								</span>
							)}
							{attrs.selector && attrs.selectorMatchCount >= 0 && (
								<span className="flex gap-1.5">
									<span className="flex-shrink-0 text-foreground/50">
										{t("stylePanel.inspector.selectorMatchCount")}
									</span>
									<span>{attrs.selectorMatchCount}</span>
								</span>
							)}
						</span>
					)}

					{/* Element attributes */}
					{attributeEntries.length > 0 && (
						<span className="block">
							<span className="text-foreground/50">
								{t("stylePanel.inspector.elementAttributes")}
							</span>
							<span className="mt-0.5 grid grid-cols-[auto_1fr] gap-x-1.5 gap-y-px rounded bg-muted/50 px-1.5 py-1 font-mono text-[11px]">
								{attributeEntries.map(([name, value]) => (
									<Fragment key={name}>
										<span className="text-foreground/50">{name}:</span>
										<span className="min-w-0 break-all text-foreground/70">
											{value}
										</span>
									</Fragment>
								))}
							</span>
						</span>
					)}

					{/* DOM context */}
					{(parsedDomContext.parentSelector ||
						parsedDomContext.previousSibling ||
						parsedDomContext.nextSibling) && (
						<span className="block space-y-0.5">
							<span className="text-foreground/50">
								{t("stylePanel.inspector.domContext")}
							</span>
							{parsedDomContext.parentSelector && (
								<span className="block break-all font-mono">
									{parsedDomContext.parentSelector}
								</span>
							)}
							<span className="block">
								{t("stylePanel.inspector.elementPosition")}:{" "}
								{parsedDomContext.siblingIndex ?? 0};{" "}
								{t("stylePanel.inspector.sameTagPosition")}:{" "}
								{parsedDomContext.sameTagIndex ?? 0} /{" "}
								{parsedDomContext.sameTagSiblingCount ?? 0}
							</span>
							{parsedDomContext.previousSibling && (
								<span className="block break-all">
									← {parsedDomContext.previousSibling}
								</span>
							)}
							{parsedDomContext.nextSibling && (
								<span className="block break-all">
									→ {parsedDomContext.nextSibling}
								</span>
							)}
						</span>
					)}

					{/* HTML snippet */}
					{attrs.elementHtml && (
						<span className="block">
							<span className="text-foreground/50">
								{t("stylePanel.inspector.elementHtml")}
							</span>
							<code className="mt-0.5 block max-h-20 overflow-auto whitespace-pre-wrap break-all rounded bg-muted/50 px-1.5 py-1 font-mono text-[11px] text-foreground/70">
								{attrs.elementHtml}
							</code>
						</span>
					)}

					{/* Text content */}
					{attrs.textContent && (
						<span className="flex gap-1.5">
							<span className="flex-shrink-0 text-foreground/50">
								{t("stylePanel.inspector.textContent")}
							</span>
							<span className="min-w-0 break-all italic">
								&ldquo;{attrs.textContent}&rdquo;
							</span>
						</span>
					)}
				</span>
			)}
		</NodeViewWrapper>
	)
}
