import {
	DndContext,
	PointerSensor,
	closestCenter,
	useSensor,
	useSensors,
	type DragEndEvent,
} from "@dnd-kit/core"
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical } from "lucide-react"
import { EditableGridCard } from "./EditableGridCard"
import type { OptionItem, OptionItemKeyResolver } from "../types"
import { resolveOptionItemKey } from "../utils"
import { cn } from "@/lib/utils"

interface EditableGridProps {
	items: OptionItem[]
	selectedKeys: Set<string>
	getItemKey?: OptionItemKeyResolver
	onSelect: (itemKey: string, checked: boolean) => void
	onEdit: (item: OptionItem) => void
	onDelete: (itemKey: string) => void
	onReorder?: (items: OptionItem[]) => void
}

export function EditableGrid({
	items,
	selectedKeys,
	getItemKey,
	onSelect,
	onEdit,
	onDelete,
	onReorder,
}: EditableGridProps) {
	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: { distance: 8 },
		}),
	)
	const itemIds = items.map((item, index) => resolveOptionItemKey(item, index, getItemKey))
	const isSortable = !!onReorder && items.length > 1

	function handleDragEnd(event: DragEndEvent) {
		const { active, over } = event
		if (!over || active.id === over.id) return

		const oldIndex = itemIds.findIndex((id) => id === String(active.id))
		const newIndex = itemIds.findIndex((id) => id === String(over.id))
		if (oldIndex < 0 || newIndex < 0) return

		onReorder?.(arrayMove(items, oldIndex, newIndex))
	}

	const content = (
		<div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
			{items.map((item, index) => {
				const itemKey = resolveOptionItemKey(item, index, getItemKey)

				if (!isSortable) {
					return (
						<EditableGridCard
							key={itemKey}
							item={item}
							itemKey={itemKey}
							isSelected={selectedKeys.has(itemKey)}
							onSelect={onSelect}
							onEdit={() => onEdit(item)}
							onDelete={() => onDelete(itemKey)}
						/>
					)
				}

				return (
					<SortableEditableGridCard
						key={itemKey}
						item={item}
						itemKey={itemKey}
						isSelected={selectedKeys.has(itemKey)}
						onSelect={onSelect}
						onEdit={() => onEdit(item)}
						onDelete={() => onDelete(itemKey)}
					/>
				)
			})}
		</div>
	)

	if (!isSortable) return content

	return (
		<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
			<SortableContext items={itemIds} strategy={rectSortingStrategy}>
				{content}
			</SortableContext>
		</DndContext>
	)
}

interface SortableEditableGridCardProps {
	item: OptionItem
	itemKey: string
	isSelected: boolean
	onSelect: (itemKey: string, checked: boolean) => void
	onEdit: () => void
	onDelete: () => void
}

function SortableEditableGridCard({
	item,
	itemKey,
	isSelected,
	onSelect,
	onEdit,
	onDelete,
}: SortableEditableGridCardProps) {
	const {
		attributes,
		listeners,
		setNodeRef,
		setActivatorNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: itemKey })

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		zIndex: isDragging ? 1 : undefined,
	}

	return (
		<div ref={setNodeRef} style={style} className={cn("relative", isDragging && "opacity-70")}>
			<EditableGridCard
				item={item}
				itemKey={itemKey}
				isSelected={isSelected}
				onSelect={onSelect}
				onEdit={onEdit}
				onDelete={onDelete}
			/>
			<button
				ref={setActivatorNodeRef}
				type="button"
				className={cn(
					"absolute right-2.5 top-2.5 z-10 flex size-6 items-center justify-center rounded-md border border-border bg-background/90 text-muted-foreground shadow-xs transition-colors hover:text-foreground",
					isDragging ? "cursor-grabbing text-primary" : "cursor-grab",
				)}
				aria-label="drag"
				data-testid={`editable-grid-card-drag-${itemKey}`}
				{...attributes}
				{...listeners}
			>
				<GripVertical className="size-4" />
			</button>
		</div>
	)
}
