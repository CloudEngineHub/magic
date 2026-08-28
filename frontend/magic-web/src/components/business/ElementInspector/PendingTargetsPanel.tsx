import {
	Camera,
	ChevronDown,
	ChevronUp,
	Edit3,
	ListChecks,
	Loader2,
	MousePointer,
	Send,
	Trash2,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { useState } from "react"
import { Button } from "@/components/shadcn-ui/button"
import MagicTooltip from "@/components/base/MagicTooltip"
import { cn } from "@/utils/cn"
import type { HtmlMultiSelectionSubmitState, HtmlSelectionTarget } from "./types"
import { getShortSelector } from "./format"

interface PendingTargetsPanelProps {
	targets: HtmlSelectionTarget[]
	submitState: HtmlMultiSelectionSubmitState
	submitError?: string | null
	onEdit: (target: HtmlSelectionTarget) => void
	onRemove: (targetId: string) => void
	onSubmit: () => void
	selectionMode?: "element" | "screenshot"
	onSelectionModeChange?: (mode: "element" | "screenshot") => void
	screenshotSupported?: boolean
	onExit?: () => void
	/** Bottom distance from the containing canvas, including space for other chrome. */
	bottomOffset?: number
}

/** Fixed collection bar; target details remain available while the current element is highlighted. */
export function PendingTargetsPanel({
	targets,
	submitState,
	submitError,
	onEdit,
	onRemove,
	onSubmit,
	selectionMode = "element",
	onSelectionModeChange,
	screenshotSupported = true,
	onExit,
	bottomOffset = 16,
}: PendingTargetsPanelProps) {
	const { t } = useTranslation("super")
	const [isExpanded, setIsExpanded] = useState(true)
	const isSubmitting = submitState === "submitting"
	const hasEmptyInstruction = targets.some((target) => !target.instruction.trim())
	const canSubmit = targets.length > 0 && !hasEmptyInstruction && !isSubmitting

	return (
		<div
			className="pointer-events-auto absolute left-1/2 z-30 w-[min(680px,calc(100%-24px))] -translate-x-1/2 overflow-hidden rounded-2xl border bg-popover/95 shadow-xl backdrop-blur-sm"
			style={{ bottom: bottomOffset }}
			data-testid="element-inspector-pending-panel"
		>
			{targets.length > 0 && isExpanded && (
				<div
					id="element-inspector-pending-target-list"
					className="max-h-36 space-y-1 overflow-y-auto border-b p-2.5"
					data-testid="element-inspector-pending-target-list"
				>
					{targets.map((target) => (
						<div
							key={target.id}
							className="flex items-start gap-2 rounded-lg bg-muted/40 px-2 py-1.5"
						>
							{target.screenshot?.dataUrl && (
								<img
									src={target.screenshot.dataUrl}
									alt=""
									className="h-9 w-12 shrink-0 rounded border object-cover"
								/>
							)}
							<div className="min-w-0 flex-1">
								<div className="truncate font-mono text-[10px] font-semibold">
									{target.kind === "screenshot"
										? t("stylePanel.inspector.screenshot")
										: getShortSelector(target.info)}
								</div>
								<div className="line-clamp-2 text-[11px] text-muted-foreground">
									{target.instruction ||
										t("stylePanel.inspector.emptyDescription")}
								</div>
							</div>
							<div className="flex shrink-0 items-center gap-0.5">
								<MagicTooltip
									title={t("stylePanel.inspector.editTarget")}
									placement="top"
									contentZIndex={10060}
								>
									<Button
										variant="ghost"
										size="icon-sm"
										className="h-7 w-7 text-muted-foreground hover:bg-background hover:text-foreground"
										onClick={() => onEdit(target)}
										aria-label={t("stylePanel.inspector.editTarget")}
									>
										<Edit3 size={13} />
									</Button>
								</MagicTooltip>
								<MagicTooltip
									title={t("stylePanel.inspector.removeTarget")}
									placement="top"
									contentZIndex={10060}
								>
									<Button
										variant="ghost"
										size="icon-sm"
										className="h-7 w-7 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
										onClick={() => onRemove(target.id)}
										aria-label={t("stylePanel.inspector.removeTarget")}
									>
										<Trash2 size={13} />
									</Button>
								</MagicTooltip>
							</div>
						</div>
					))}
				</div>
			)}

			<div className="flex min-h-14 items-center gap-2 px-3 py-2.5">
				<div
					className="flex items-center gap-0.5 rounded-xl bg-muted/70 p-1 shadow-inner"
					role="group"
					aria-label={t("stylePanel.inspector.selectionMode")}
				>
					<MagicTooltip
						title={t("stylePanel.inspector.elementMode")}
						placement="top"
						contentZIndex={10060}
					>
						<Button
							variant="ghost"
							size="icon-sm"
							className={cn(
								"h-9 w-9 rounded-lg transition-[background-color,color,box-shadow,transform] active:scale-[0.96]",
								selectionMode === "element"
									? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
									: "text-muted-foreground hover:bg-background/80 hover:text-foreground",
							)}
							onClick={() => onSelectionModeChange?.("element")}
							aria-label={t("stylePanel.inspector.elementMode")}
							aria-pressed={selectionMode === "element"}
						>
							<MousePointer size={15} />
						</Button>
					</MagicTooltip>
					{screenshotSupported && (
						<MagicTooltip
							title={t("stylePanel.inspector.screenshotMode")}
							placement="top"
							contentZIndex={10060}
						>
							<Button
								variant="ghost"
								size="icon-sm"
								className={cn(
									"h-9 w-9 rounded-lg transition-[background-color,color,box-shadow,transform] active:scale-[0.96]",
									selectionMode === "screenshot"
										? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
										: "text-muted-foreground hover:bg-background/80 hover:text-foreground",
								)}
								onClick={() => onSelectionModeChange?.("screenshot")}
								aria-label={t("stylePanel.inspector.screenshotMode")}
								aria-pressed={selectionMode === "screenshot"}
							>
								<Camera size={15} />
							</Button>
						</MagicTooltip>
					)}
				</div>

				<div className="h-6 w-px bg-border" />

				<button
					type="button"
					className={cn(
						"flex min-w-0 items-center gap-1.5 rounded-md px-1 py-1 text-sm text-muted-foreground",
						"hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						"disabled:pointer-events-none disabled:opacity-50",
					)}
					onClick={() => setIsExpanded((expanded) => !expanded)}
					disabled={targets.length === 0}
					aria-expanded={targets.length > 0 ? isExpanded : false}
					aria-controls="element-inspector-pending-target-list"
					data-testid="element-inspector-pending-target-toggle"
					aria-label={t(
						isExpanded
							? "stylePanel.inspector.collapsePendingTargets"
							: "stylePanel.inspector.expandPendingTargets",
					)}
				>
					<ListChecks size={16} className="shrink-0" />
					<span className="truncate tabular-nums">
						{t("stylePanel.inspector.pendingTargetCount", { count: targets.length })}
					</span>
					{targets.length > 0 &&
						(isExpanded ? (
							<ChevronUp size={14} className="shrink-0" aria-hidden="true" />
						) : (
							<ChevronDown size={14} className="shrink-0" aria-hidden="true" />
						))}
				</button>

				<div className="ml-auto flex shrink-0 items-center gap-1.5">
					{onExit && (
						<Button
							variant="ghost"
							size="sm"
							className="h-9 rounded-lg px-3 transition-transform active:scale-[0.96]"
							onClick={onExit}
						>
							{t("stylePanel.inspector.exit")}
						</Button>
					)}
					<Button
						variant="default"
						size="sm"
						className="h-9 gap-1.5 rounded-lg px-4 transition-transform active:scale-[0.96]"
						disabled={!canSubmit}
						onClick={onSubmit}
						data-testid="element-inspector-submit-button"
					>
						{isSubmitting ? (
							<Loader2 size={15} className="animate-spin" />
						) : (
							<Send size={15} />
						)}
						{t("stylePanel.inspector.submit")}
					</Button>
				</div>
			</div>

			{(submitError || hasEmptyInstruction || submitState === "succeeded") && (
				<div
					className={`border-t px-3 py-2 text-xs ${
						submitState === "succeeded" && !submitError && !hasEmptyInstruction
							? "text-emerald-600"
							: "text-destructive"
					}`}
				>
					{submitError ||
						(hasEmptyInstruction
							? t("stylePanel.inspector.descriptionRequired")
							: t("stylePanel.inspector.submitSuccess"))}
				</div>
			)}
		</div>
	)
}
