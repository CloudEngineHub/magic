import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import type { SceneEditorQueueContext } from "../../../MainInputContainer/components/editors/types"

export default function QueueDraftNotice({ context }: { context?: SceneEditorQueueContext }) {
	const { t } = useTranslation("super")
	const draft = context?.queueDraft?.queueDraft
	if (!context || !draft) return null
	const message =
		draft.phase === "removing"
			? t("messageQueue.removalUnconfirmed")
			: draft.phase === "submitting" || draft.phase === "unconfirmed"
				? t("messageQueue.requeueUnconfirmed")
				: draft.returnPosition === "original"
					? t("messageQueue.detachedForEdit")
					: t("messageQueue.detachedForTail")
	return (
		<div
			className="flex w-full shrink-0 items-center gap-2 rounded-lg bg-muted px-2 py-1 text-xs text-muted-foreground"
			role="status"
		>
			<span className="min-w-0 flex-1">{message}</span>
			{draft.phase === "removing" && (
				<Button
					variant="ghost"
					size="sm"
					className="h-7 shrink-0 px-2 text-xs"
					disabled={context.isQueueOperationPending}
					onClick={() => void context.retryQueueDraftRemoval()}
				>
					{t("messageQueue.retryRemoval")}
				</Button>
			)}
			<Button
				variant="ghost"
				size="sm"
				className="h-7 shrink-0 px-2 text-xs"
				disabled={context.isQueueOperationPending}
				onClick={() => void context.cancelEditQueueItem()}
			>
				{t("messageQueue.keepDraft")}
			</Button>
		</div>
	)
}
