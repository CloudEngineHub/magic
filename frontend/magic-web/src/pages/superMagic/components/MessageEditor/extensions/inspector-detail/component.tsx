import { Fragment, useState } from "react"
import { NodeViewWrapper } from "@tiptap/react"
import type { NodeViewProps } from "@tiptap/react"
import { ChevronRight, ChevronDown, Crosshair } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import {
	MentionItemType,
	type ProjectFileMentionData,
} from "@/components/business/MentionPanel/types"
import type { InspectorDetailAttrs } from "./types"
import { getInspectorDetailHeaderLabel } from "./display"

export const InspectorDetailComponent: React.FC<NodeViewProps> = ({ node }) => {
	const attrs = node.attrs as InspectorDetailAttrs
	const [expanded, setExpanded] = useState(false)
	const { t } = useTranslation("super")

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

	const headerLabel = getInspectorDetailHeaderLabel(t)
	const fileData =
		attrs.fileMention?.type === MentionItemType.PROJECT_FILE
			? (attrs.fileMention.data as ProjectFileMentionData)
			: null

	return (
		<NodeViewWrapper
			as="span"
			data-type="inspector-detail"
			className={cn(
				"select-none transition-colors",
				expanded
					? "my-1 block w-full rounded-md border border-primary/50 bg-primary/5"
					: "magic-mention inline-flex max-w-[min(360px,100%)] border border-border/60 !bg-muted/30 px-0.5 align-middle",
			)}
		>
			{/* Collapsed header — always visible */}
			<button
				type="button"
				className={cn(
					"inline-flex max-w-full cursor-pointer items-center gap-1 text-left font-[inherit] leading-[inherit] text-[inherit]",
					expanded ? "w-full" : "w-auto",
					expanded &&
						"border-b border-primary/20 px-1 py-0.5 text-xs font-normal leading-5 text-primary",
				)}
				onClick={() => setExpanded((v) => !v)}
				contentEditable={false}
				data-testid="set-expanded"
			>
				<Crosshair size={12} className="flex-shrink-0 text-primary" />
				<span className="min-w-0 flex-1 truncate text-[inherit]">{headerLabel}</span>
				{expanded ? (
					<ChevronDown size={12} className="flex-shrink-0 text-primary/70" />
				) : (
					<ChevronRight size={12} className="flex-shrink-0 text-primary/70" />
				)}
			</button>

			{/* Expanded detail panel */}
			{expanded && (
				<span
					className="block space-y-1 px-2 py-1.5 text-[11px] text-foreground/70"
					contentEditable={false}
				>
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
