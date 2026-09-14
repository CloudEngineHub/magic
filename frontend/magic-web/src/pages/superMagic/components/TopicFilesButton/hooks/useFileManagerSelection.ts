import { useEffect, useMemo, type Dispatch, type SetStateAction } from "react"
import { useMemoizedFn } from "ahooks"
import type { FileManagerLocationState } from "../components/FileManager/types"

interface Modifiers {
	shiftKey: boolean
	metaKey: boolean
	ctrlKey: boolean
}

export function useFileManagerSelection({
	ids,
	location,
	setLocation,
	ready,
}: {
	ids: string[]
	location: FileManagerLocationState
	setLocation: Dispatch<SetStateAction<FileManagerLocationState>>
	ready: boolean
}) {
	const positions = useMemo(() => new Map(ids.map((id, index) => [id, index])), [ids])
	const select = useMemoizedFn((id: string, modifiers: Modifiers, focusOnly = false) => {
		setLocation((current) => {
			const additive = modifiers.metaKey || modifiers.ctrlKey
			let selectedIds = new Set(additive ? current.selectedIds : [])
			if (focusOnly) selectedIds = current.selectedIds
			else if (modifiers.shiftKey && current.anchorId && positions.has(current.anchorId)) {
				const start = positions.get(current.anchorId) ?? 0
				const end = positions.get(id) ?? start
				for (let index = Math.min(start, end); index <= Math.max(start, end); index++)
					selectedIds.add(ids[index])
			} else if (additive && selectedIds.has(id)) selectedIds.delete(id)
			else selectedIds.add(id)
			return {
				...current,
				selectedIds,
				focusedId: id,
				anchorId: modifiers.shiftKey ? (current.anchorId ?? id) : id,
			}
		})
	})
	const replace = useMemoizedFn((selectedIds: Set<string>) => {
		setLocation((current) => ({
			...current,
			selectedIds,
			focusedId: selectedIds.values().next().value ?? null,
		}))
	})
	// 加载期间或错误时保留选择；只有成功取得目录内容后才移除消失的 ID。
	useEffect(() => {
		if (!ready) return
		setLocation((current) => {
			const selectedIds = new Set([...current.selectedIds].filter((id) => positions.has(id)))
			const focusedId =
				current.focusedId && positions.has(current.focusedId) ? current.focusedId : null
			if (selectedIds.size === current.selectedIds.size && focusedId === current.focusedId)
				return current
			return { ...current, selectedIds, focusedId }
		})
	}, [positions, ready, setLocation])
	return {
		selectedIds: location.selectedIds,
		focusedId: location.focusedId,
		positions,
		select,
		replace,
		clear: () =>
			setLocation((current) => ({
				...current,
				selectedIds: new Set(),
				focusedId: null,
				anchorId: null,
			})),
		all: () => replace(new Set(ids)),
	}
}
