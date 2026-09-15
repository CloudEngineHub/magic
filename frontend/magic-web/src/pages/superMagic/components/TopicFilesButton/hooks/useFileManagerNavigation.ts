import { useEffect, useRef, useState } from "react"
import { useMemoizedFn } from "ahooks"
import type { FileManagerLocationSnapshot } from "@/models/config/repositories/SuperProjectStateTypes"
import type {
	FileManagerLocationState,
	FileManagerSort,
	FileManagerSortDirection,
	FileManagerView,
} from "../components/FileManager/types"

function createLocation(
	directoryId: string,
	saved?: FileManagerLocationSnapshot,
): FileManagerLocationState {
	return {
		directoryId,
		selectedIds: new Set(saved?.selectedIds ?? []),
		focusedId: saved?.focusedId ?? null,
		anchorId: saved?.anchorId ?? null,
		scrollTop: saved?.scrollTop ?? 0,
		scrollLeft: saved?.scrollLeft ?? 0,
		query: saved?.query ?? "",
	}
}

/** 访问历史与父目录是两种导航；每个位置只保存 ID 和视图状态，不复制附件树。 */
export function useFileManagerNavigation(
	initialDirectoryId: string,
	initialView: FileManagerView = "grid",
	initialState?: FileManagerLocationSnapshot,
) {
	const [location, setLocation] = useState(() => createLocation(initialDirectoryId, initialState))
	const [history, setHistory] = useState({ ids: [initialDirectoryId], cursor: 0 })
	const [view, setView] = useState<FileManagerView>(initialState?.view ?? initialView)
	const [sort, setSort] = useState<FileManagerSort>(initialState?.sort ?? "name")
	const [sortDirection, setSortDirection] = useState<FileManagerSortDirection>(
		initialState?.sortDirection ?? "ascending",
	)
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
	const scrollTop = useRef(initialState?.scrollTop ?? 0)
	const scrollLeft = useRef(initialState?.scrollLeft ?? 0)
	const previousInitial = useRef(initialDirectoryId)
	const saveCurrent = useMemoizedFn(() => {
		savedLocations.current.set(location.directoryId, {
			...location,
			scrollTop: scrollTop.current,
			scrollLeft: scrollLeft.current,
		})
	})
	const restore = useMemoizedFn((id: string) => {
		const next = savedLocations.current.get(id) ?? createLocation(id)
		scrollTop.current = next.scrollTop
		scrollLeft.current = next.scrollLeft
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
		previousInitial.current = initialDirectoryId
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
		getScrollPosition: () => ({ scrollTop: scrollTop.current, scrollLeft: scrollLeft.current }),
		onScroll: (top: number, left: number) => {
			scrollTop.current = top
			scrollLeft.current = left
		},
	}
}
