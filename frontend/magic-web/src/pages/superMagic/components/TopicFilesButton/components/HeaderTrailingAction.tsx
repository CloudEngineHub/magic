import type { ReactNode } from "react"

interface HeaderTrailingActionProps {
	children: ReactNode
}

export default function HeaderTrailingAction({ children }: HeaderTrailingActionProps) {
	// 独立于可裁剪的普通工具组，按实际宽度占位，窄侧栏也能保留末尾操作。
	return <div className="flex shrink-0 items-center gap-1">{children}</div>
}
