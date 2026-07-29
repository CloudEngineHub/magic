import { Fragment, useState } from "react"
import { ChevronRight, ChevronDown, Crosshair } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import {
	MentionItemType,
	type ProjectFileMentionData,
} from "@/components/business/MentionPanel/types"
import type { TiptapMentionAttributes } from "@/components/business/MentionPanel/tiptap-plugin"
import { getInspectorDetailHeaderLabel } from "@/pages/superMagic/components/MessageEditor/extensions/inspector-detail/display"

interface InspectorDetailReadOnlyProps {
	attrs: {
		selector: string
		tagName: string
		size: string
		computedStyles: string
		styleCount: number
		textContent: string
		fileMention?: TiptapMentionAttributes | null
	}
}

export function InspectorDetailReadOnly({ attrs }: InspectorDetailReadOnlyProps) {
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

	const headerLabel = getInspectorDetailHeaderLabel(t)
	const fileData =
		attrs.fileMention?.type === MentionItemType.PROJECT_FILE
			? (attrs.fileMention.data as ProjectFileMentionData)
			: null

	return (
		<span
			className={cn(
				"inspector-detail-read-only select-none transition-colors",
				expanded
					? "my-1 block w-full rounded-md border border-primary/50 bg-primary/5"
					: "magic-mention inline-flex max-w-[min(360px,100%)] border border-border/60 !bg-muted/30 px-0.5 align-middle",
			)}
		>
			<button
				type="button"
				className={cn(
					"inline-flex max-w-full cursor-pointer items-center gap-1 text-left font-[inherit] leading-[inherit] text-[inherit]",
					expanded ? "w-full" : "w-auto",
					expanded &&
						"border-b border-primary/20 px-1 py-0.5 text-xs font-normal leading-5 text-primary",
				)}
				onClick={() => setExpanded((v) => !v)}
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

			{expanded && (
				<span className="block space-y-1 px-2 py-1.5 text-[11px] text-foreground/70">
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

					{attrs.size && (
						<span className="flex gap-1.5">
							<span className="flex-shrink-0 text-foreground/50">
								{t("stylePanel.inspector.size")}
							</span>
							<span>{attrs.size}</span>
						</span>
					)}

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
		</span>
	)
}
