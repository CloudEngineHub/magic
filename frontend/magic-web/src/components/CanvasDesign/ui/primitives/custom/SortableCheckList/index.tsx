import {
	closestCenter,
	DndContext,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
	type DragEndEvent,
	type Modifier,
} from "@dnd-kit/core"
import {
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical } from "lucide-react"
import type { ReactNode } from "react"
import { Checkbox } from "../../shadcn/checkbox"
import styles from "./index.module.css"

export interface SortableCheckListItem {
	id: string
	checked: boolean
	content: ReactNode
	contentTitle?: string
	checkboxAriaLabel: string
	checkboxTitle?: string
	dragHandleAriaLabel: string
	dragHandleTitle?: string
}

interface SortableCheckListProps {
	items: SortableCheckListItem[]
	onCheckedChange: (id: string, checked: boolean) => void
	onReorder: (activeId: string, overId: string) => void
}

const restrictToListBounds: Modifier = ({ containerNodeRect, draggingNodeRect, transform }) => {
	if (!containerNodeRect || !draggingNodeRect) {
		return { ...transform, x: 0 }
	}

	const minY = containerNodeRect.top - draggingNodeRect.top
	const maxY = containerNodeRect.bottom - draggingNodeRect.bottom
	return {
		...transform,
		x: 0,
		y: Math.min(Math.max(transform.y, minY), maxY),
	}
}

const listModifiers = [restrictToListBounds]

interface SortableCheckListItemProps {
	item: SortableCheckListItem
	onCheckedChange: (id: string, checked: boolean) => void
}

function SortableCheckListItemView(props: SortableCheckListItemProps) {
	const { item, onCheckedChange } = props
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id: item.id,
	})

	return (
		<div
			ref={setNodeRef}
			className={styles.item}
			data-dragging={isDragging ? "" : undefined}
			data-selected={item.checked ? "" : undefined}
			style={{
				transform: CSS.Transform.toString(transform),
				transition,
			}}
			onClick={() => onCheckedChange(item.id, !item.checked)}
		>
			<Checkbox
				checked={item.checked}
				className={styles.checkbox}
				aria-label={item.checkboxAriaLabel}
				title={item.checkboxTitle}
				onClick={(event) => event.stopPropagation()}
				onCheckedChange={(checked) => onCheckedChange(item.id, checked === true)}
			/>
			<div className={styles.content} title={item.contentTitle}>
				{item.content}
			</div>
			<button
				type="button"
				className={styles.dragHandle}
				aria-label={item.dragHandleAriaLabel}
				title={item.dragHandleTitle}
				onClick={(event) => event.stopPropagation()}
				{...attributes}
				{...listeners}
			>
				<GripVertical size={14} aria-hidden />
			</button>
		</div>
	)
}

export default function SortableCheckList(props: SortableCheckListProps) {
	const { items, onCheckedChange, onReorder } = props
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
	)
	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event
		if (!over) return
		onReorder(String(active.id), String(over.id))
	}

	if (items.length === 0) return null

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={closestCenter}
			modifiers={listModifiers}
			onDragEnd={handleDragEnd}
		>
			<SortableContext
				items={items.map((item) => item.id)}
				strategy={verticalListSortingStrategy}
			>
				<div className={styles.list}>
					{items.map((item) => (
						<SortableCheckListItemView
							key={item.id}
							item={item}
							onCheckedChange={onCheckedChange}
						/>
					))}
				</div>
			</SortableContext>
		</DndContext>
	)
}
