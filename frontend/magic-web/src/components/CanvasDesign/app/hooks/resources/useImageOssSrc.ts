import { useState, useEffect, useCallback } from "react"
import { useCanvas } from "../../providers/CanvasProvider"
import type { ImageElement } from "../../../runtime/document/types"
import { useCanvasEvent } from "../canvas"
import { toCanonicalCanvasResourcePath } from "../../../runtime/shared/path/canvasResourcePath"

/**
 * 检查图片元素的 ossSrc 是否已加载
 * @param imageElement - 图片元素数据
 * @returns ossSrc 是否已加载，以及 ossSrc 的值
 */
export function useImageOssSrc(imageElement: ImageElement | null) {
	const { canvas } = useCanvas()
	const [ossSrc, setOssSrc] = useState<string | undefined>(undefined)

	const path = imageElement?.src

	// 初始同步及 path 变化时只换取 OSS URL，不触发图片解码
	const syncOssSrc = useCallback(async () => {
		if (!canvas || !path) return
		const ossInfo = await canvas.imageResourceManager.ensureFreshOssInfo(path)
		if (ossInfo) {
			setOssSrc(ossInfo.ossSrc)
		}
	}, [canvas, path])

	useEffect(() => {
		if (!path || !canvas) {
			setOssSrc(undefined)
			return
		}
		syncOssSrc()
	}, [path, canvas, syncOssSrc])

	useCanvasEvent(
		"element:image:ossSrcReady",
		({ data }) => {
			if (data.elementId === imageElement?.id) {
				syncOssSrc()
			}
		},
		[imageElement?.id, syncOssSrc],
	)

	useCanvasEvent(
		"resource:image:loaded",
		({ data }) => {
			if (!canvas || !path) return
			if (data.resource.variant === "low") return
			const resolveAbs = canvas.magicConfigManager.config?.methods?.resolveAbsolutePath
			if (
				toCanonicalCanvasResourcePath(data.path, resolveAbs) ===
				toCanonicalCanvasResourcePath(path, resolveAbs)
			) {
				setOssSrc(data.resource.ossSrc)
			}
		},
		[canvas, path],
	)

	return {
		hasOssSrc: !!ossSrc,
		ossSrc,
	}
}
