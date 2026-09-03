import { useCallback, useEffect, useRef, useState } from "react"
import { useMagic } from "../../../app/providers/MagicProvider"
import type { CanvasDesignStorageData } from "../../../public/magic-types"

interface CachedMinimapOpenState {
	isMinimapOpen: boolean
	toggleMinimap: () => void
}

function readCachedMinimapOpen(
	getStorage: (() => CanvasDesignStorageData | null) | undefined,
): boolean {
	if (!getStorage) return false
	try {
		return getStorage()?.minimapOpen ?? false
	} catch {
		return false
	}
}

/** 读取并持久化当前设计项目的小地图展开状态。 */
export function useCachedMinimapOpen(): CachedMinimapOpenState {
	const { methods } = useMagic()
	const getStorage = methods?.getStorage
	const saveStorage = methods?.saveStorage
	const [isMinimapOpen, setIsMinimapOpen] = useState(() => readCachedMinimapOpen(getStorage))
	const lastPersistedValueRef = useRef(isMinimapOpen)

	useEffect(() => {
		if (isMinimapOpen === lastPersistedValueRef.current || !saveStorage) return

		try {
			const existingStorage = getStorage?.() ?? {}
			saveStorage({
				...existingStorage,
				minimapOpen: isMinimapOpen,
			})
			lastPersistedValueRef.current = isMinimapOpen
		} catch {
			// 本地缓存不可用时保留当前会话状态，不阻断小地图开关。
		}
	}, [getStorage, isMinimapOpen, saveStorage])

	const toggleMinimap = useCallback(() => {
		setIsMinimapOpen((open) => !open)
	}, [])

	return {
		isMinimapOpen,
		toggleMinimap,
	}
}
