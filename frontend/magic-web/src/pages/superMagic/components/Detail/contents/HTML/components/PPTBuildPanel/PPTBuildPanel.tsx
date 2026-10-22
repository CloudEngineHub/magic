import { useEffect, useState, type ReactNode, type RefObject } from "react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import {
	DndContext,
	KeyboardSensor,
	PointerSensor,
	closestCenter,
	useSensor,
	useSensors,
	type DragEndEvent,
} from "@dnd-kit/core"
import {
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
	ArrowDown,
	ArrowUp,
	Eye,
	EyeOff,
	GripVertical,
	ListOrdered,
	Plus,
	Redo2,
	Undo2,
	X,
} from "lucide-react"
import { Button } from "@/components/shadcn-ui/button"
import { ScrollArea } from "@/components/shadcn-ui/scroll-area"
import MagicTooltip from "@/components/base/MagicTooltip"
import { cn } from "@/utils/cn"
import type { HTMLEditorV2Ref } from "../../iframe-bridge/types/props"
import { useStylePanelStore } from "../../iframe-bridge/contexts/StylePanelContext"
import { useSelectedElement } from "../StylePanel/hooks/useSelectedElement"
import { appendBuildStep, groupBuildQueue, reorderBuildQueue } from "./buildQueue"
import { usePPTBuildQueue } from "./usePPTBuildQueue"
import { PPTBuildQueueItem } from "./PPTBuildQueueItem"

export const PPTBuildPanel = observer(function PPTBuildPanel({
	editorRef,
	contentRevision,
	disabled,
	onClose,
	onCommit,
}: {
	editorRef: RefObject<HTMLEditorV2Ref>
	contentRevision: number
	disabled?: boolean
	onClose: () => void
	onCommit?: () => Promise<boolean>
}) {
	const { t } = useTranslation("super")
	const { selectedElement } = useSelectedElement(editorRef)
	const { historyState } = useStylePanelStore()
	const { entries, loading, busy, failed, update, travel, reload } = usePPTBuildQueue(
		editorRef,
		contentRevision,
		onCommit,
	)
	const groups = groupBuildQueue(entries)
	const locked = disabled || busy || loading || failed
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
	)
	// Display number of the step the canvas is previewed up to; null shows the full page.
	const [previewSteps, setPreviewSteps] = useState<number | null>(null)
	const togglePreview = (steps: number) => {
		const next = previewSteps === steps ? null : steps
		setPreviewSteps(next)
		void editorRef.current?.previewPPTBuild(next).catch(() => setPreviewSteps(null))
	}
	// Any queue change (edit, undo, reload) invalidates what the preview showed.
	useEffect(() => {
		setPreviewSteps(null)
	}, [entries])
	useEffect(
		() => () => {
			void editorRef.current?.previewPPTBuild(null).catch(() => {
				/* The iframe may already have been disposed. */
			})
		},
		[editorRef],
	)
	const selected = entries.find((entry) => entry.selector === selectedElement?.selector)
	const move = (from: number, to: number) => void update(reorderBuildQueue(entries, from, to))
	const onDragEnd = ({ active, over }: DragEndEvent) => {
		if (!over || active.id === over.id || locked) return
		const from = groups.findIndex((group) => group.step === active.id)
		const to = groups.findIndex((group) => group.step === over.id)
		if (from >= 0 && to >= 0) move(from, to)
	}
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
				<div className="flex items-center gap-0.5">
					{[
						{
							key: "undo" as const,
							icon: Undo2,
							label: t("ppt.build.undo"),
							enabled: historyState.canUndo,
						},
						{
							key: "redo" as const,
							icon: Redo2,
							label: t("ppt.build.redo"),
							enabled: historyState.canRedo,
						},
					].map(({ key, icon: Icon, label, enabled }) => (
						<MagicTooltip key={key} title={label}>
							<Button
								variant="ghost"
								size="icon"
								className="size-7"
								aria-label={label}
								data-testid={`ppt-build-${key}`}
								disabled={locked || !enabled}
								onClick={() => void travel(key)}
							>
								<Icon size={16} />
							</Button>
						</MagicTooltip>
					))}
					<MagicTooltip title={t("ppt.build.close")}>
						<Button
							variant="ghost"
							size="icon"
							className="size-7"
							aria-label={t("ppt.build.close")}
							onClick={onClose}
							disabled={busy || disabled}
						>
							<X size={16} />
						</Button>
					</MagicTooltip>
				</div>
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
			<ScrollArea className="min-h-0 flex-1" viewportClassName="p-3 [&>div]:!block">
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
					<DndContext
						sensors={sensors}
						collisionDetection={closestCenter}
						onDragEnd={onDragEnd}
					>
						<SortableContext
							items={groups.map((group) => group.step)}
							strategy={verticalListSortingStrategy}
						>
							<ol
								className="space-y-3"
								aria-label={t("ppt.build.queue")}
								aria-busy={busy}
							>
								{groups.map((group, index) => (
									<SortableStep
										key={group.step}
										id={group.step}
										locked={locked}
										label={t("ppt.build.stepLabel", { step: index + 1 })}
										preview={{
											label:
												previewSteps === index + 1
													? t("ppt.build.stopPreview")
													: t("ppt.build.previewStep"),
											active: previewSteps === index + 1,
											disabled: locked,
											onClick: () => togglePreview(index + 1),
										}}
										moveUp={{
											label: t("ppt.build.moveUp"),
											disabled: locked || index <= 0,
											onClick: () => move(index, index - 1),
										}}
										moveDown={{
											label: t("ppt.build.moveDown"),
											disabled: locked || index >= groups.length - 1,
											onClick: () => move(index, index + 1),
										}}
									>
										<ul className="space-y-1 p-1">
											{group.items.map((entry) => (
												<PPTBuildQueueItem
													key={entry.selector}
													entry={entry}
													entries={entries}
													selected={
														entry.selector === selectedElement?.selector
													}
													disabled={locked}
													delayedUntilStep={
														entry.ancestorStep !== undefined &&
														entry.ancestorStep > entry.build.step
															? groups.findIndex(
																	(item) =>
																		item.step ===
																		entry.ancestorStep,
																) + 1 || undefined
															: undefined
													}
													onSelect={select}
													onUpdate={update}
												/>
											))}
										</ul>
									</SortableStep>
								))}
							</ol>
						</SortableContext>
					</DndContext>
				)}
			</ScrollArea>
			<p className="border-t border-border p-3 text-xs text-muted-foreground" role="status">
				{busy ? t("ppt.build.updating") : t("ppt.build.queueHint")}
			</p>
		</aside>
	)
})

interface StepAction {
	label: string
	disabled: boolean
	onClick: () => void
}

function SortableStep({
	id,
	locked,
	label,
	preview,
	moveUp,
	moveDown,
	children,
}: {
	id: number
	locked: boolean
	label: string
	preview: StepAction & { active: boolean }
	moveUp: StepAction
	moveDown: StepAction
	children: ReactNode
}) {
	const {
		attributes,
		listeners,
		setNodeRef,
		setActivatorNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id, disabled: locked })
	return (
		<li
			ref={setNodeRef}
			style={{ transform: CSS.Transform.toString(transform), transition }}
			className={cn(
				"relative rounded-md border border-border bg-background",
				isDragging && "z-10 opacity-70 shadow-md",
			)}
		>
			<div className="flex items-center gap-1 border-b border-border bg-muted/40 px-2 py-1">
				<button
					type="button"
					ref={setActivatorNodeRef}
					disabled={locked}
					className="flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
					aria-label={label}
					{...attributes}
					{...listeners}
				>
					<GripVertical size={16} />
				</button>
				<span className="min-w-0 flex-1 truncate text-xs font-medium">{label}</span>
				{[
					{ icon: preview.active ? EyeOff : Eye, action: preview },
					{ icon: ArrowUp, action: moveUp },
					{ icon: ArrowDown, action: moveDown },
				].map(({ icon: Icon, action }) => (
					<MagicTooltip key={action.label} title={action.label}>
						<Button
							variant="ghost"
							size="icon"
							className="size-7 shrink-0"
							aria-label={action.label}
							disabled={action.disabled}
							onClick={action.onClick}
						>
							<Icon size={16} />
						</Button>
					</MagicTooltip>
				))}
			</div>
			{children}
		</li>
	)
}
