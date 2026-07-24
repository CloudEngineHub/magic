import { ErrorBoundary } from "react-error-boundary"
import type { PropsWithChildren, ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { IconAlertCircle } from "@tabler/icons-react"
import { logger as Logger } from "@/utils/log"

const logger = Logger.createLogger("MessageRenderErrorBoundary")

interface MessageRenderErrorBoundaryProps extends PropsWithChildren {
	messageKey: string
	resetKey?: string | number | null
	fallbackWrapper?: (fallback: ReactNode) => ReactNode
}

function MessageRenderFallback({ onRetry }: { onRetry: () => void }) {
	const { t } = useTranslation("super")

	return (
		<div
			className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
			data-testid="message-render-error"
			role="status"
		>
			<IconAlertCircle className="size-4 shrink-0" aria-hidden="true" />
			<span className="min-w-0 flex-1">{t("messageRenderError.title")}</span>
			<button
				type="button"
				className="shrink-0 rounded px-1.5 py-0.5 text-xs text-foreground underline-offset-2 hover:underline"
				onClick={onRetry}
			>
				{t("messageRenderError.retry")}
			</button>
		</div>
	)
}

export default function MessageRenderErrorBoundary({
	messageKey,
	resetKey,
	fallbackWrapper,
	children,
}: MessageRenderErrorBoundaryProps) {
	return (
		<ErrorBoundary
			resetKeys={resetKey === undefined ? undefined : [resetKey]}
			onError={(error, errorInfo) => {
				logger.error("Message render failed", {
					messageKey,
					error,
					componentStack: errorInfo.componentStack,
					errorBoundary: "MessageRenderErrorBoundary",
				})
			}}
			fallbackRender={({ resetErrorBoundary }) => {
				const fallback = <MessageRenderFallback onRetry={resetErrorBoundary} />
				return fallbackWrapper ? fallbackWrapper(fallback) : fallback
			}}
		>
			{children}
		</ErrorBoundary>
	)
}
