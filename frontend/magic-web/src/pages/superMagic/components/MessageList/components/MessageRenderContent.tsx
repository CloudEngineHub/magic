import type { ReactNode } from "react"

interface MessageRenderContentProps {
	render: () => ReactNode
}

/** 在 ErrorBoundary 的子树内执行消息渲染函数，使同步渲染异常能被边界捕获。 */
export default function MessageRenderContent({ render }: MessageRenderContentProps) {
	return render()
}
