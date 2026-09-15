import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import { CircleArrowDown, Pencil } from "lucide-react"
import { hasMeaningfulData } from "../../../MessageEditor/services/draftService/utils"
import type { SceneEditorQueueContext } from "../../../MainInputContainer/components/editors/types"

export default function QueueDraftNotice({ context }: { context?: SceneEditorQueueContext }) {
	const { t } = useTranslation("super")
	const draft = context?.queueDraft?.queueDraft
	if (!context || !draft) return null
	if (
		draft.phase === "detached" &&
		!hasMeaningfulData({
			value: context.queueDraft?.value,
			mentionItems: context.queueDraft?.mentionItems,
		})
	)
		return null
	const detached = draft.phase === "detached"
	const Icon = draft.returnPosition === "original" ? Pencil : CircleArrowDown
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
			className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-border pb-2 pt-1 text-xs text-muted-foreground"
			role="status"
		>
			{detached && (
				<span className="inline-flex items-center gap-1.5 font-medium text-foreground">
					<Icon size={16} aria-hidden="true" />
					{draft.returnPosition === "original"
						? t("messageQueue.editingDraft")
						: t("messageQueue.withdrawnDraft")}
				</span>
			)}
			<span className="min-w-0">{message}</span>
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
				variant="outline"
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
