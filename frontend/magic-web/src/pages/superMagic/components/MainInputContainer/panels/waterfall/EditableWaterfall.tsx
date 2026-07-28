import { useMemo } from "react"
import { EditableWaterfallCard } from "./EditableWaterfallCard"
import { useWaterfallColumns } from "./useWaterfallColumns"
import type { OptionItem, OptionItemKeyResolver } from "../types"
import { resolveOptionItemKey } from "../utils"

interface EditableWaterfallProps {
	items: OptionItem[]
	selectedKeys: Set<string>
	getItemKey?: OptionItemKeyResolver
	onSelect: (value: string, checked: boolean) => void
	onEdit: (item: OptionItem) => void
	onDelete: (value: string) => void
	maxColumns?: number
}

export function EditableWaterfall({
	items,
	selectedKeys,
	getItemKey,
	onSelect,
	onEdit,
	onDelete,
	maxColumns = 3,
}: EditableWaterfallProps) {
	const { containerRef, columns } = useWaterfallColumns(maxColumns)

	const columnItems = useMemo(() => {
		const cols: OptionItem[][] = Array.from({ length: columns }, () => [])
		items.forEach((item, index) => cols[index % columns].push(item))
		return cols
	}, [items, columns])

	return (
		<div ref={containerRef} className="flex w-full items-start gap-2">
			{columnItems.map((colItems, colIndex) => (
				<div key={colIndex} className="flex flex-1 flex-col gap-2">
					{colItems.map((item, itemIndex) => {
						const sourceIndex = items.indexOf(item)
						const itemKey = resolveOptionItemKey(item, sourceIndex, getItemKey)

						return (
							<EditableWaterfallCard
								key={itemKey || `${colIndex}-${itemIndex}`}
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
			))}
		</div>
	)
}
