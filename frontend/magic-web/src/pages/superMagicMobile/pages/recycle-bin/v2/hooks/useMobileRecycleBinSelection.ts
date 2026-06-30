import { useCallback, useEffect, useMemo, useState } from "react"
import type { RecycleBinItemData } from "../components/RecycleBinItem"

export function useMobileRecycleBinSelection(
	filteredItems: RecycleBinItemData[],
	activeTab?: string,
) {
	const [selectedIds, setSelectedIds] = useState<string[]>([])
	const [isSelectAllActive, setIsSelectAllActive] = useState(false)

	const filteredItemIds = useMemo(() => filteredItems.map((item) => item.id), [filteredItems])
	const selectedCount = filteredItemIds.filter((id) => selectedIds.includes(id)).length

	useEffect(() => {
		if (!isSelectAllActive) return
		setSelectedIds(filteredItemIds)
	}, [isSelectAllActive, filteredItemIds])

	useEffect(() => {
		setIsSelectAllActive(false)
		setSelectedIds([])
	}, [activeTab])

	const handleSelectionChange = useCallback((id: string, selected: boolean) => {
		setIsSelectAllActive(false)
		setSelectedIds((prev) =>
			selected ? (prev.includes(id) ? prev : [...prev, id]) : prev.filter((x) => x !== id),
		)
	}, [])

	const handleSelectAll = useCallback(() => {
		setIsSelectAllActive(true)
		setSelectedIds(filteredItemIds)
	}, [filteredItemIds])

	const handleDeselectAll = useCallback(() => {
		setIsSelectAllActive(false)
		setSelectedIds([])
	}, [])

	const isAllSelected = useMemo(
		() => selectedCount === filteredItemIds.length && filteredItemIds.length > 0,
		[selectedCount, filteredItemIds.length],
	)

	return {
		selectedIds,
		setSelectedIds,
		selectedCount,
		isAllSelected,
		handleSelectionChange,
		handleSelectAll,
		handleDeselectAll,
	}
}
