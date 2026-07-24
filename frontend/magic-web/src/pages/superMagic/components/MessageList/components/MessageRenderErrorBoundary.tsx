import { ErrorBoundary } from "react-error-boundary"
import type { PropsWithChildren } from "react"
import { logger as Logger } from "@/utils/log"

const logger = Logger.createLogger("MessageRenderErrorBoundary")

interface MessageRenderErrorBoundaryProps extends PropsWithChildren {
	messageKey: string
}

export default function MessageRenderErrorBoundary({
	messageKey,
	children,
}: MessageRenderErrorBoundaryProps) {
	return (
		<ErrorBoundary
			onError={(error, errorInfo) => {
				logger.error("Message render failed", {
					messageKey,
					error,
					componentStack: errorInfo.componentStack,
					errorBoundary: "MessageRenderErrorBoundary",
				})
			}}
			fallbackRender={() => (
				<div
					className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-muted-foreground"
					data-testid="message-render-error"
					role="alert"
				>
					该消息暂时无法显示
				</div>
			)}
		>
			{children}
		</ErrorBoundary>
	)
}
