import { CircleAlert, CirclePause, Loader2, MessageCircleQuestion, Trash2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import dayjs from "@/infrastructure/vendors/dayjs"
import { cn } from "@/utils/cn"
import type { TemplateChatEntry } from "../hooks/useTemplateChats"
import { reportTemplateName } from "../services/researchFiles"
import { PRESSABLE } from "./surface"

interface TemplateChatCardProps {
	entry: TemplateChatEntry
	onOpen: () => void
	/** Absent when the project is read-only. */
	onDelete?: () => void
}

/**
 * A template conversation that is not finished yet, in the template grid, so closing the side
 * panel never loses it. Clicking reopens the conversation; a stopped or failed one also offers
 * "continue" and "delete conversation".
 */
export default function TemplateChatCard({ entry, onOpen, onDelete }: TemplateChatCardProps) {
	const { t, i18n } = useTranslation("personaResearch")
	const { marker, topic, state } = entry
	const dayjsLocale = i18n.language.toLowerCase().startsWith("zh") ? "zh-cn" : "en"
	const title =
		topic.topic_name ||
		(marker.mode === "edit" && marker.template_path
			? t("reportTemplates.chat.editIntroTitle", {
					name: reportTemplateName(marker.template_path),
				})
			: t("reportTemplates.chat.title"))
	const stateView = {
		generating: { icon: Loader2, className: "animate-spin text-foreground" },
		waiting: { icon: MessageCircleQuestion, className: "text-amber-600" },
		stopped: { icon: CirclePause, className: "text-muted-foreground" },
		failed: { icon: CircleAlert, className: "text-destructive" },
	}[state]
	const Icon = stateView.icon
	const settled = state === "stopped" || state === "failed"

	return (
		<div
			className={cn(
				"flex flex-col overflow-hidden rounded-xl border border-dashed bg-background transition-shadow hover:shadow-md",
				state === "waiting" ? "border-amber-500/60" : "border-border",
			)}
			data-testid="report-template-chat-card"
		>
			<button
				type="button"
				onClick={onOpen}
				className={cn(
					"flex aspect-[4/3] w-full flex-col items-center justify-center gap-1.5 border-b border-dashed border-border bg-muted/40 px-6 text-center outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
					PRESSABLE,
				)}
			>
				<Icon className={cn("size-5 motion-reduce:animate-none", stateView.className)} />
				<span className="text-sm font-medium">
					{t(`reportTemplates.chatCard.${state}`)}
				</span>
				<span className="text-xs leading-5 text-muted-foreground">
					{t(`reportTemplates.chatCard.${state}Hint`)}
				</span>
			</button>
			<div className="flex items-center gap-2 px-3 py-2.5">
				<div className="flex min-w-0 flex-1 flex-col">
					<span className="truncate text-sm font-medium">{title}</span>
					<span className="text-xs text-muted-foreground">
						{marker.started_at
							? t("reportTemplates.chatCard.started", {
									time: dayjs(marker.started_at).locale(dayjsLocale).fromNow(),
								})
							: null}
					</span>
				</div>
				{settled ? (
					<>
						{onDelete ? (
							<Button
								variant="ghost"
								size="sm"
								className="h-7 px-2 text-xs text-muted-foreground"
								onClick={onDelete}
							>
								<Trash2 className="size-3.5" />
								{t("reportTemplates.chatCard.delete")}
							</Button>
						) : null}
						<Button
							variant="outline"
							size="sm"
							className="h-7 px-2.5 text-xs"
							onClick={onOpen}
						>
							{t("reportTemplates.chatCard.continue")}
						</Button>
					</>
				) : null}
			</div>
		</div>
	)
}
