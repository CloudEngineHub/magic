import { Check, X } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import { Textarea } from "@/components/shadcn-ui/textarea"
import type { InspectedElementInfo } from "./types"
import { getShortSelector } from "./format"

interface ElementEditPopoverProps {
	info?: InspectedElementInfo
	targetKind?: "element" | "screenshot"
	screenshotDataUrl?: string
	box: { left: number; top: number; width: number; height: number }
	containerWidth: number
	containerHeight: number
	instruction: string
	onInstructionChange: (instruction: string) => void
	onConfirm: () => void
	onCancel: () => void
}

export function ElementEditPopover({
	info,
	targetKind = "element",
	screenshotDataUrl,
	box,
	containerWidth,
	containerHeight,
	instruction,
	onInstructionChange,
	onConfirm,
	onCancel,
}: ElementEditPopoverProps) {
	const { t } = useTranslation("super")
	const width = 300
	const height = 204
	const left = Math.max(4, Math.min(box.left + box.width + 8, containerWidth - width - 4))
	const top = Math.max(4, Math.min(box.top, containerHeight - height - 4))
	const targetLabel =
		targetKind === "screenshot"
			? t("stylePanel.inspector.screenshot")
			: info
				? getShortSelector(info)
				: t("stylePanel.inspector.element")

	return (
		<div
			className="pointer-events-auto absolute z-50 flex flex-col rounded-xl border bg-popover/95 shadow-xl backdrop-blur-sm"
			style={{ left, top, width }}
			data-testid="element-inspector-edit-popover"
		>
			<Button
				variant="ghost"
				size="icon-sm"
				className="absolute right-2 top-2 z-10 h-7 w-7 rounded-md"
				onClick={onCancel}
				aria-label={t("stylePanel.inspector.cancel")}
			>
				<X size={15} />
			</Button>

			<div className="space-y-2.5 p-3">
				<div className="flex min-w-0 items-center gap-2 pr-8">
					<span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
					<span className="truncate font-mono text-[11px] text-muted-foreground">
						{targetLabel}
					</span>
				</div>
				<div className="flex min-h-16 items-center justify-center rounded-md bg-muted/50 px-2 py-1.5 text-[11px] text-muted-foreground">
					{screenshotDataUrl ? (
						<img
							src={screenshotDataUrl}
							alt=""
							className="max-h-16 max-w-full rounded object-contain"
						/>
					) : (
						info?.textContent || info?.resource || info?.tagName
					)}
				</div>
				<Textarea
					value={instruction}
					onChange={(event) => onInstructionChange(event.target.value)}
					placeholder={t("stylePanel.inspector.multiSelectionPlaceholder")}
					className="h-20 min-h-20 resize-none text-xs"
					maxLength={2000}
					autoFocus
				/>
			</div>

			<div className="flex items-center justify-end gap-2 border-t px-3 py-2">
				<Button variant="ghost" size="sm" onClick={onCancel}>
					{t("stylePanel.inspector.cancel")}
				</Button>
				<Button size="sm" onClick={onConfirm} disabled={!instruction.trim()}>
					<Check size={14} />
					{t("stylePanel.inspector.confirm")}
				</Button>
			</div>
		</div>
	)
}
