import { ErrorBoundary } from "react-error-boundary"
import type { PropsWithChildren } from "react"
import { useTranslation } from "react-i18next"
import { IconAlertCircle } from "@tabler/icons-react"
import { logger as Logger } from "@/utils/log"

const logger = Logger.createLogger("MessageRenderErrorBoundary")

interface MessageRenderErrorBoundaryProps extends PropsWithChildren {
	messageKey: string
}

function MessageRenderFallback() {
	const { t } = useTranslation("super")

	return (
		<div
			className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
			data-testid="message-render-error"
			role="status"
		>
			<IconAlertCircle className="size-4 shrink-0" aria-hidden="true" />
			<span>{t("messageRenderError.title")}</span>
		</div>
	)
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
			fallbackRender={() => <MessageRenderFallback />}
		>
			{children}
		</ErrorBoundary>
	)
}
