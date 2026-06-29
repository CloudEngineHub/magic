import { Loader2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import useNavigate from "@/routes/hooks/useNavigate"
import type { CrewConversationStatus } from "../store/root-store"

interface CrewStateViewProps {
	status: CrewConversationStatus
	onRetry?: () => void
}

export default function CrewStateView({ status, onRetry }: CrewStateViewProps) {
	const { t } = useTranslation("crew/market")
	const navigate = useNavigate()

	if (status === "loading" || status === "idle") {
		return (
			<div
				className="flex h-full w-full items-center justify-center bg-background"
				data-testid="crew-conversation-loading"
			>
				<Loader2 className="size-8 animate-spin text-muted-foreground" />
			</div>
		)
	}

	return (
		<div
			className="flex h-full w-full flex-col items-center justify-center gap-4 bg-background px-6 text-center"
			data-testid="crew-conversation-error"
		>
			<p className="text-sm text-muted-foreground">
				{status === "invalid"
					? t("crewConversation.invalidCode")
					: t("crewConversation.loadFailed")}
			</p>
			<div className="flex items-center gap-2">
				<Button type="button" variant="outline" onClick={() => navigate({ delta: -1 })}>
					{t("crewConversation.back")}
				</Button>
				{status === "error" && onRetry ? (
					<Button type="button" onClick={onRetry}>
						{t("crewConversation.retry")}
					</Button>
				) : null}
			</div>
		</div>
	)
}
