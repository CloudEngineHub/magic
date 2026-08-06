import { useEffect, type MouseEvent } from "react"
import { useTranslation } from "react-i18next"
import { ScrollArea, ScrollBar } from "@/components/shadcn-ui/scroll-area"
import { cn } from "@/lib/utils"
import MarkdownComponent from "../../../Text/components/Markdown"
import { ReasoningPanel } from "../../shared/ReasoningPanel"
import { useScrollAreaAutoScroll } from "../../shared/hooks/useScrollAreaAutoScroll"
import { useMessageViewState } from "@/pages/superMagic/components/MessageList/view-state/MessageViewStateContext"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import { messageMarkdownBaseClassName } from "./ContentSection"

const reasoningMarkdownClassName = cn(
	messageMarkdownBaseClassName,
	"text-xs leading-5 text-muted-foreground",
)

interface ReasoningSectionProps {
	node?: Record<string, unknown>
	messageId: string
	streamState?: string
	onMouseEnter?: (evt: MouseEvent) => void
	onMouseLeave?: (evt: MouseEvent) => void
}

export function ReasoningSection({
	node,
	messageId,
	streamState,
	onMouseEnter,
	onMouseLeave,
}: ReasoningSectionProps) {
	const { t } = useTranslation("super")
	const reasoningContent =
		typeof node?.reasoning_content === "string" ? node.reasoning_content : ""
	const hasReasoningContent = !/^\s*$/.test(reasoningContent)
	const [openReasoning, setOpenReasoning] = useMessageViewState("reasoning-expanded", false)
	const [hasUserControlledReasoning, setHasUserControlledReasoning] = useMessageViewState(
		"reasoning-user-controlled",
		false,
	)
	const { viewportRef } = useScrollAreaAutoScroll({
		isStreaming: streamState === "reasoning_content",
	})

	useEffect(() => {
		if (hasUserControlledReasoning) return
		setOpenReasoning(streamState === "reasoning_content")
	}, [hasUserControlledReasoning, messageId, setOpenReasoning, streamState])

	if (!hasReasoningContent) return null

	return (
		<ReasoningPanel
			classNames="p-0"
			open={openReasoning}
			loading={streamState === "reasoning_content"}
			title={
				streamState === "reasoning_content"
					? t("agentThink.thinking")
					: t("agentThink.thinkDone")
			}
			onToggle={() => {
				pubsub.publish(PubSubEvents.Message_Suppress_Auto_Scroll)
				setHasUserControlledReasoning(true)
				setOpenReasoning((open) => !open)
			}}
		>
			<ScrollArea
				viewportRef={viewportRef}
				className="mx-[6px] mb-1 rounded-lg border-black/[0.08] bg-[#f5f6f7] dark:bg-white/10 [&_[data-radix-scroll-area-viewport]]:max-h-60"
			>
				<MarkdownComponent
					className={cn(
						reasoningMarkdownClassName,
						"w-full px-3 pb-1 pt-2 text-muted-foreground/50",
					)}
					onMouseEnter={onMouseEnter}
					onMouseLeave={onMouseLeave}
					isStreaming={streamState === "reasoning_content"}
					enableHtmlCodeBlockPreview={false}
					content={reasoningContent}
				/>
				<ScrollBar orientation="vertical" />
			</ScrollArea>
		</ReasoningPanel>
	)
}
