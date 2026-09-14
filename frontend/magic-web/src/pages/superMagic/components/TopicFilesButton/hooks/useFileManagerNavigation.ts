import { useEffect, useRef, useState } from "react"
import { useMemoizedFn } from "ahooks"
import type {
	FileManagerLocationState,
	FileManagerSort,
	FileManagerSortDirection,
	FileManagerView,
} from "../components/FileManager/types"

function createLocation(directoryId: string | null): FileManagerLocationState {
	return {
		directoryId,
		selectedIds: new Set(),
		focusedId: null,
		anchorId: null,
		scrollTop: 0,
		query: "",
	}
}

/** 访问历史与父目录是两种导航；每个位置只保存 ID 和视图状态，不复制附件树。 */
export function useFileManagerNavigation(
	initialDirectoryId: string | null,
	initialView: FileManagerView = "grid",
) {
	const [location, setLocation] = useState(() => createLocation(initialDirectoryId))
	const [history, setHistory] = useState({
		ids: initialDirectoryId === null ? [] : [initialDirectoryId],
		cursor: initialDirectoryId === null ? -1 : 0,
	})
	const [view, setView] = useState<FileManagerView>(initialView)
	const [sort, setSort] = useState<FileManagerSort>("name")
	const [sortDirection, setSortDirection] = useState<FileManagerSortDirection>("ascending")
	const changeSort = useMemoizedFn((next: FileManagerSort, toggle = false) => {
		setSortDirection(
			next === sort
				? toggle
					? sortDirection === "ascending"
						? "descending"
						: "ascending"
					: sortDirection
				: next === "modified" || next === "created"
					? "descending"
					: "ascending",
		)
		setSort(next)
	})
	const savedLocations = useRef(new Map<string, FileManagerLocationState>())
	const scrollTop = useRef(0)
	const previousInitial = useRef(initialDirectoryId)
	const saveCurrent = useMemoizedFn(() => {
		if (location.directoryId === null) return
		savedLocations.current.set(location.directoryId, {
			...location,
			scrollTop: scrollTop.current,
		})
	})
	const restore = useMemoizedFn((id: string) => {
		const next = savedLocations.current.get(id) ?? createLocation(id)
		scrollTop.current = next.scrollTop
		setLocation(next)
	})
	const navigate = useMemoizedFn((id: string) => {
		if (id === location.directoryId) return
		saveCurrent()
		setHistory((current) => ({
			ids: [...current.ids.slice(0, current.cursor + 1), id],
			cursor: current.cursor + 1,
		}))
		restore(id)
	})
	const go = useMemoizedFn((offset: -1 | 1) => {
		const cursor = history.cursor + offset
		if (cursor < 0 || cursor >= history.ids.length) return
		saveCurrent()
		setHistory({ ...history, cursor })
		restore(history.ids[cursor])
	})
	useEffect(() => {
		if (previousInitial.current === initialDirectoryId) return
		const wasMissing = previousInitial.current === null
		previousInitial.current = initialDirectoryId
		// 首次写入产生真实根时保留搜索等当次交互，不把未创建目录加入访问历史。
		if (wasMissing || initialDirectoryId === null) {
			setLocation((current) => ({ ...current, directoryId: initialDirectoryId }))
			setHistory({
				ids: initialDirectoryId === null ? [] : [initialDirectoryId],
				cursor: initialDirectoryId === null ? -1 : 0,
			})
			return
		}
		navigate(initialDirectoryId)
	}, [initialDirectoryId, navigate])
	return {
		location,
		setLocation,
		view,
		setView,
		sort,
		setSort: changeSort,
		sortDirection,
		navigate,
		back: () => go(-1),
		forward: () => go(1),
		canBack: history.cursor > 0,
		canForward: history.cursor < history.ids.length - 1,
		onScroll: (top: number) => {
			scrollTop.current = top
		},
	}
}
