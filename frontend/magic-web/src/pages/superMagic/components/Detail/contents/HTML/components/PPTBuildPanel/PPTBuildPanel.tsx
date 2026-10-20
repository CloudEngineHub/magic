import { useState, type RefObject } from "react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { ArrowDown, ArrowUp, GripVertical, ListOrdered, Plus, X } from "lucide-react"
import { Button } from "@/components/shadcn-ui/button"
import { ScrollArea } from "@/components/shadcn-ui/scroll-area"
import MagicTooltip from "@/components/base/MagicTooltip"
import { cn } from "@/utils/cn"
import type { HTMLEditorV2Ref } from "../../iframe-bridge/types/props"
import { useSelectedElement } from "../StylePanel/hooks/useSelectedElement"
import { appendBuildStep, groupBuildQueue, reorderBuildQueue } from "./buildQueue"
import { usePPTBuildQueue } from "./usePPTBuildQueue"
import { PPTBuildQueueItem } from "./PPTBuildQueueItem"

export const PPTBuildPanel = observer(function PPTBuildPanel({
	editorRef,
	contentRevision,
	disabled,
	onClose,
}: {
	editorRef: RefObject<HTMLEditorV2Ref>
	contentRevision: number
	disabled?: boolean
	onClose: () => void
}) {
	const { t } = useTranslation("super")
	const { selectedElement } = useSelectedElement(editorRef)
	const { entries, loading, busy, failed, update, reload } = usePPTBuildQueue(
		editorRef,
		contentRevision,
	)
	const groups = groupBuildQueue(entries)
	const locked = disabled || busy || loading || failed
	const [draggedStep, setDraggedStep] = useState<number | null>(null)
	const selected = entries.find((entry) => entry.selector === selectedElement?.selector)
	const move = (from: number, to: number) => void update(reorderBuildQueue(entries, from, to))
	const select = (selector: string) => {
		void editorRef.current?.selectElement(selector).catch(() => {
			void reload()
		})
	}
	return (
		<aside
			aria-label={t("ppt.build.title")}
			data-testid="ppt-build-panel"
			className="flex min-h-0 w-72 max-w-[45%] shrink-0 flex-col border-l border-border bg-background max-md:absolute max-md:inset-y-0 max-md:right-0 max-md:z-30 max-md:max-w-[85%] max-md:shadow-lg"
		>
			<div className="flex items-center justify-between gap-2 border-b border-border p-3">
				<h3 className="flex items-center gap-2 text-sm font-medium">
					<ListOrdered size={16} /> {t("ppt.build.title")}
				</h3>
				<MagicTooltip title={t("ppt.build.close")}>
					<Button
						variant="ghost"
						size="icon"
						className="size-7"
						aria-label={t("ppt.build.close")}
						onClick={onClose}
					>
						<X size={16} />
					</Button>
				</MagicTooltip>
			</div>
			<div className="space-y-2 border-b border-border p-3">
				<Button
					variant="outline"
					size="sm"
					className="w-full"
					disabled={
						locked ||
						!selectedElement?.selector ||
						Boolean(selected) ||
						groups.length >= 1000
					}
					onClick={() => {
						if (!selectedElement) return
						void update(appendBuildStep(entries, selectedElement.selector))
					}}
				>
					<Plus size={16} /> {t("ppt.build.addSelected")}
				</Button>
				<p className="text-xs text-muted-foreground">
					{selected ? t("ppt.build.alreadyAdded") : t("ppt.build.pickElement")}
				</p>
			</div>
			<ScrollArea className="min-h-0 flex-1" viewportClassName="p-3">
				{loading ? (
					<p role="status" className="text-xs text-muted-foreground">
						{t("ppt.build.loading")}
					</p>
				) : failed ? (
					<div role="alert" className="space-y-2 text-xs">
						<p>{t("ppt.build.loadFailed")}</p>
						<Button variant="outline" size="sm" onClick={() => void reload()}>
							{t("ppt.build.retry")}
						</Button>
					</div>
				) : !groups.length ? (
					<p className="py-6 text-center text-xs text-muted-foreground">
						{t("ppt.build.empty")}
					</p>
				) : (
					<ol className="space-y-3" aria-label={t("ppt.build.queue")} aria-busy={busy}>
						{groups.map((group, index) => (
							<li
								key={group.step}
								className={cn(
									"rounded-md border border-border",
									draggedStep === index && "opacity-50",
								)}
								onDragOver={(event) => {
									if (draggedStep !== null && !locked) event.preventDefault()
								}}
								onDrop={(event) => {
									event.preventDefault()
									if (draggedStep !== null && !locked) move(draggedStep, index)
									setDraggedStep(null)
								}}
							>
								<div className="flex items-center gap-1 border-b border-border bg-muted/40 px-2 py-1">
									<span
										draggable={!locked}
										onDragStart={(event) => {
											event.dataTransfer.effectAllowed = "move"
											event.dataTransfer.setData("text/plain", String(index))
											setDraggedStep(index)
										}}
										onDragEnd={() => setDraggedStep(null)}
										className="cursor-grab text-muted-foreground"
										aria-hidden="true"
									>
										<GripVertical size={16} />
									</span>
									<span className="flex-1 text-xs font-medium">
										{t("ppt.build.stepLabel", { step: index + 1 })}
									</span>
									{[
										{
											icon: ArrowUp,
											label: t("ppt.build.moveUp"),
											to: index - 1,
										},
										{
											icon: ArrowDown,
											label: t("ppt.build.moveDown"),
											to: index + 1,
										},
									].map(({ icon: Icon, label, to }) => (
										<MagicTooltip key={label} title={label}>
											<Button
												variant="ghost"
												size="icon"
												className="size-7"
												aria-label={label}
												disabled={locked || to < 0 || to >= groups.length}
												onClick={() => move(index, to)}
											>
												<Icon size={16} />
											</Button>
										</MagicTooltip>
									))}
								</div>
								<ul className="space-y-1 p-1">
									{group.items.map((entry) => (
										<PPTBuildQueueItem
											key={entry.selector}
											entry={entry}
											entries={entries}
											selected={entry.selector === selectedElement?.selector}
											disabled={locked}
											onSelect={select}
											onUpdate={update}
										/>
									))}
								</ul>
							</li>
						))}
					</ol>
				)}
			</ScrollArea>
			<p className="border-t border-border p-3 text-xs text-muted-foreground" role="status">
				{busy ? t("ppt.build.updating") : t("ppt.build.queueHint")}
			</p>
		</aside>
	)
})
