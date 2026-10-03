import { useCallback, useEffect, useState } from "react"
import { useCanvas } from "../../../app/providers/CanvasProvider"
import { useMagic } from "../../../app/providers/MagicProvider"
import type { CanvasDesignStorageData } from "../../../public/magic-types"

const DEFAULT_MEDIA_LABELS_ALWAYS_VISIBLE = true

function readCachedMediaLabelsAlwaysVisible(
	getStorage: (() => CanvasDesignStorageData | null) | undefined,
): boolean {
	if (!getStorage) return DEFAULT_MEDIA_LABELS_ALWAYS_VISIBLE
	try {
		return getStorage()?.mediaLabelsAlwaysVisible ?? DEFAULT_MEDIA_LABELS_ALWAYS_VISIBLE
	} catch {
		return DEFAULT_MEDIA_LABELS_ALWAYS_VISIBLE
	}
}

interface CachedMediaLabelsAlwaysVisibleState {
	mediaLabelsAlwaysVisible: boolean
	setMediaLabelsAlwaysVisible: (alwaysVisible: boolean) => void
}

/** 读取、应用并持久化当前设计项目的媒体标签显示偏好。 */
export function useCachedMediaLabelsAlwaysVisible(): CachedMediaLabelsAlwaysVisibleState {
	const { canvas } = useCanvas()
	const { methods } = useMagic()
	const getStorage = methods?.getStorage
	const saveStorage = methods?.saveStorage
	const [mediaLabelsAlwaysVisible, setMediaLabelsAlwaysVisible] = useState(() =>
		readCachedMediaLabelsAlwaysVisible(getStorage),
	)

	useEffect(() => {
		if (typeof canvas?.setMediaLabelsAlwaysVisible === "function") {
			canvas.setMediaLabelsAlwaysVisible(mediaLabelsAlwaysVisible)
		}
	}, [canvas, mediaLabelsAlwaysVisible])

	const updateMediaLabelsAlwaysVisible = useCallback(
		(alwaysVisible: boolean) => {
			setMediaLabelsAlwaysVisible(alwaysVisible)
			if (!saveStorage) return

			try {
				const existingStorage = getStorage?.() ?? {}
				saveStorage({
					...existingStorage,
					mediaLabelsAlwaysVisible: alwaysVisible,
				})
			} catch {
				// 本地缓存不可用时保留当前会话状态，不阻断画布操作。
			}
		},
		[getStorage, saveStorage],
	)

	return {
		mediaLabelsAlwaysVisible,
		setMediaLabelsAlwaysVisible: updateMediaLabelsAlwaysVisible,
	}
}
