import { useSize } from "ahooks"
import { useMemo } from "react"

export function useAutoCollapsed(collapsed: boolean) {
	const size = useSize(document.body)

	return useMemo(() => (size?.width ? size?.width < 768 : collapsed), [collapsed, size?.width])
}
