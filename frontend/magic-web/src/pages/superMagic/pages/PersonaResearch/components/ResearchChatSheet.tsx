import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react"
import { useMemoizedFn } from "ahooks"
import { Sparkles } from "lucide-react"
import { observer } from "mobx-react-lite"
import { ScrollArea } from "@/components/shadcn-ui/scroll-area"
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/shadcn-ui/sheet"
import DefaultMessageEditorContainer from "@/pages/superMagic/components/MainInputContainer/components/editors/DefaultMessageEditorContainer"
import MobileInputContainer from "@/pages/superMagicMobile/pages/ChatPage/components/MobileInputContainer"
import type { Topic } from "@/pages/superMagic/pages/Workspace/types"
import { useIsMobile } from "@/hooks/useIsMobile"
import { usePersonaResearchStore } from "../context"
import { useResearchEditor } from "../hooks/useResearchEditor"
import ResearchConversationPanel from "./ResearchConversationPanel"

export interface ResearchChatIntro {
	title: string
	text: string
	tips: { icon: ComponentType<{ className?: string }>; text: string }[]
	/** Composer text when the sheet opens, e.g. "Build personas only from …". */
	prompt: string
	disclaimer: string
	/** Composer placeholder; defaults to the research question prompt. */
	placeholder?: string
	/** Own draft slot, so text typed here never shows up in another research composer. */
	draftSlot: string
}

interface ResearchChatSheetProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	title: string
	intro: ResearchChatIntro
	/** Header action once the conversation has started, e.g. "open in studio". */
	headerAction?: (topic: Topic) => ReactNode
	/** Positive feedback under the conversation, e.g. the personas saved so far. */
	footer?: ReactNode
	/**
	 * Controlled conversation: pass the topic to reopen an earlier conversation, and receive the
	 * new one once the first message is sent. Left out, every opening starts a new conversation.
	 */
	topic?: Topic | null
	onTopicChange?: (topic: Topic) => void
}

/**
 * A side conversation for library work (building personas, creating report templates) that
 * keeps the library in view.
 *
 * Before the first message the sheet shows its intro and a prefilled composer; sending creates
 * a research topic exactly like the research home, then the shared conversation panel takes over.
 * Every opening starts a new conversation unless the caller passes `topic` to reopen one.
 */
function ResearchChatSheet({
	open,
	onOpenChange,
	title,
	intro,
	headerAction,
	footer,
	topic: controlledTopic,
	onTopicChange,
}: ResearchChatSheetProps) {
	const isMobile = useIsMobile()
	const [ownTopic, setOwnTopic] = useState<Topic | null>(null)
	const topic = controlledTopic === undefined ? ownTopic : controlledTopic
	const handleStarted = useMemoizedFn((started: Topic) => {
		setOwnTopic(started)
		onTopicChange?.(started)
	})

	useEffect(() => {
		if (!open) setOwnTopic(null)
	}, [open])

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side={isMobile ? "bottom" : "right"}
				className={
					isMobile
						? "flex h-[92dvh] flex-col gap-0 rounded-t-2xl p-0"
						: "flex w-full flex-col gap-0 p-0 sm:max-w-[520px]"
				}
			>
				<SheetHeader className="flex-row items-center gap-2 space-y-0 border-b border-border py-3 pl-4 pr-12">
					<SheetTitle className="flex-1 text-sm">{title}</SheetTitle>
					<SheetDescription className="sr-only">{intro.text}</SheetDescription>
					{topic && headerAction ? headerAction(topic) : null}
				</SheetHeader>
				<div className="flex min-h-0 flex-1 flex-col">
					{topic ? (
						<ResearchConversationPanel variant={isMobile ? "mobile" : "desktop"} />
					) : (
						<ChatIntro intro={intro} onStarted={handleStarted} />
					)}
				</div>
				{footer}
			</SheetContent>
		</Sheet>
	)
}

/** First screen: what the AI can work from, and a composer prefilled with the request. */
const ChatIntro = observer(function ChatIntro({
	intro,
	onStarted,
}: {
	intro: ResearchChatIntro
	onStarted: (topic: Topic) => void
}) {
	const store = usePersonaResearchStore()
	const isMobile = useIsMobile()
	const { editorContext, editorNodes, fillComposer } = useResearchEditor({
		variant: isMobile ? "mobile" : "desktop",
		selectedTopic: null,
		showLoading: false,
		messagesLength: 0,
		onStudyStarted: onStarted,
		onEditorReady: useMemoizedFn(() => fillComposer(intro.prompt)),
	})
	const context = useMemo(
		() => ({
			...editorContext,
			placeholder: intro.placeholder ?? editorContext.placeholder,
			draftKey: editorContext.draftKey
				? { ...editorContext.draftKey, topicId: intro.draftSlot }
				: undefined,
		}),
		[editorContext, intro.draftSlot, intro.placeholder],
	)

	return (
		<>
			<ScrollArea className="min-h-0 flex-1">
				<div className="flex flex-col items-center px-8 py-10 text-center">
					<span className="mb-3 flex size-10 items-center justify-center rounded-xl bg-muted">
						<Sparkles className="size-4" />
					</span>
					<div className="text-sm font-medium">{intro.title}</div>
					<p className="mt-1 max-w-[340px] text-xs leading-5 text-muted-foreground">
						{intro.text}
					</p>
					<ul className="mt-5 grid w-full max-w-[380px] gap-2 text-left">
						{intro.tips.map(({ icon: Icon, text }) => (
							<li
								key={text}
								className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground"
							>
								<Icon className="size-3.5 shrink-0" />
								{text}
							</li>
						))}
					</ul>
				</div>
			</ScrollArea>
			<div className="shrink-0 px-3 pb-3">
				{store.selectedProject ? (
					isMobile ? (
						<MobileInputContainer editorContext={context} editorNodes={editorNodes} />
					) : (
						<DefaultMessageEditorContainer
							editorContext={context}
							editorNodes={editorNodes}
						/>
					)
				) : null}
				<p className="mt-1.5 text-center text-[11px] text-muted-foreground">
					{intro.disclaimer}
				</p>
			</div>
		</>
	)
})

export default observer(ResearchChatSheet)
