import { useCallback, useEffect, useMemo, useState } from "react"

export interface HtmlPermissionManagerHandle {
	open: () => void
}

interface UseHtmlPermissionManagerBridgeOptions {
	available: boolean
	onManagerChange?: (manager: HtmlPermissionManagerHandle | null) => void
}

/** 统一管理授权面板状态，并向隐藏文件头的外部页面提供同一个打开入口。 */
export function useHtmlPermissionManagerBridge({
	available,
	onManagerChange,
}: UseHtmlPermissionManagerBridgeOptions) {
	const [open, setOpen] = useState(false)
	const openManager = useCallback(() => setOpen(true), [])
	const manager = useMemo<HtmlPermissionManagerHandle>(
		() => ({ open: openManager }),
		[openManager],
	)

	useEffect(() => {
		if (!available) setOpen(false)
		onManagerChange?.(available ? manager : null)
		return () => onManagerChange?.(null)
	}, [available, manager, onManagerChange])

	return {
		open,
		setOpen,
		openManager,
	}
}
