import { useEffect, useRef, useState } from "react"
import { useMemoizedFn } from "ahooks"
import type { DialogWindowOptions, DialogWindowSize } from "@/hooks/use-dialog-window"
import { useUserInfo } from "@/models/user/hooks"
import { platformKey } from "@/utils/storage"

// 推荐尺寸只用于首次打开和主动恢复；手动缩放仍由窗口的最小尺寸与视窗边界约束。
const RECOMMENDED_SIZE: DialogWindowSize = { width: 1120, height: 840 }
const VIEWPORT_RATIO: DialogWindowSize = { width: 0.9, height: 0.86 }
const MIN_SIZE: DialogWindowSize = { width: 720, height: 480 }

interface ResizeGuideState {
	storageKey?: string
	visible: boolean
}

interface ProjectManagerWindow {
	windowOptions: DialogWindowOptions
	resizeGuideVisible: boolean
	dismissResizeGuide: () => void
	restoreRecommendedSize: () => void
}

export function useProjectManagerWindow(open: boolean): ProjectManagerWindow {
	const { userInfo } = useUserInfo()
	const identity =
		userInfo?.organization_code && userInfo.user_id
			? `${userInfo.organization_code}/${userInfo.user_id}`
			: undefined
	// 所有项目入口共用尺寸偏好；账号未就绪时不使用 undefined 组成共享键。
	const sizeStorageKey = identity
		? platformKey(`super_magic/project_manager_size/${identity}`)
		: undefined
	const guideStorageKey = identity
		? platformKey(`super_magic/project_manager_resize_guide/${identity}`)
		: undefined
	const [resetSizeKey, setResetSizeKey] = useState(0)
	const [guide, setGuide] = useState<ResizeGuideState>({ visible: false })
	const completedGuideKeys = useRef(new Set<string>())

	useEffect(() => {
		if (!open || !guideStorageKey) return
		let completed = completedGuideKeys.current.has(guideStorageKey)
		try {
			completed ||= localStorage.getItem(guideStorageKey) === "1"
		} catch {
			// 存储失败时沿用本次挂载的完成记录，不影响窗口打开。
		}
		// 引导标记独立于尺寸偏好，旧用户也能看到一次说明，手动尺寸继续保留。
		setGuide({ storageKey: guideStorageKey, visible: !completed })
	}, [guideStorageKey, open])

	const dismissResizeGuide = useMemoizedFn(() => {
		if (!guideStorageKey) return
		completedGuideKeys.current.add(guideStorageKey)
		setGuide({ storageKey: guideStorageKey, visible: false })
		try {
			localStorage.setItem(guideStorageKey, "1")
		} catch {
			// 写入失败也不在当前挂载期间重复提示。
		}
	})
	const restoreRecommendedSize = useMemoizedFn(() => {
		setResetSizeKey((previous) => previous + 1)
		dismissResizeGuide()
	})
	const viewport = window.visualViewport
	const windowOptions: DialogWindowOptions = {
		open,
		draggable: true,
		resizable: true,
		defaultSize: {
			width: Math.min(
				RECOMMENDED_SIZE.width,
				(viewport?.width ?? window.innerWidth) * VIEWPORT_RATIO.width,
			),
			height: Math.min(
				RECOMMENDED_SIZE.height,
				(viewport?.height ?? window.innerHeight) * VIEWPORT_RATIO.height,
			),
		},
		minSize: MIN_SIZE,
		sizeStorageKey,
		resetSizeKey,
		onResizeEnd: dismissResizeGuide,
	}

	return {
		windowOptions,
		resizeGuideVisible:
			open && !!guideStorageKey && guide.storageKey === guideStorageKey && guide.visible,
		dismissResizeGuide,
		restoreRecommendedSize,
	}
}
