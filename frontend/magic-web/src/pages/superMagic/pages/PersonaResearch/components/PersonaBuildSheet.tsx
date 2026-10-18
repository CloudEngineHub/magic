import { useEffect, useMemo, useState } from "react"
import { useMemoizedFn } from "ahooks"
import {
	ArrowRight,
	ClipboardPaste,
	FileUp,
	Sparkles,
	SquareArrowOutUpRight,
	Target,
} from "lucide-react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
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
import { useNavigate } from "@/routes/hooks/useNavigate"
import { RouteName } from "@/routes/constants"
import { usePersonaResearchStore } from "../context"
import { useResearchEditor } from "../hooks/useResearchEditor"
import type { PersonaFile } from "../types"
import PersonaAvatar from "./PersonaAvatar"
import ResearchConversationPanel from "./ResearchConversationPanel"

interface PersonaBuildSheetProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	/** Personas that reached the library while this sheet was open. */
	savedPersonas: PersonaFile[]
	onStartStudy: (personaIds: string[]) => void
}

/**
 * Builds personas through a conversation without leaving the persona library.
 *
 * Before the first message the sheet shows its own composer (prefilled with the
 * "build personas only" request); sending creates a study topic exactly like the research home,
 * then the reused conversation panel takes over. The agent saves personas only after the user
 * approves its drafts, and the library grid behind the sheet shows them as they arrive.
 */
function PersonaBuildSheet({
	open,
	onOpenChange,
	savedPersonas,
	onStartStudy,
}: PersonaBuildSheetProps) {
	const { t } = useTranslation("personaResearch")
	const isMobile = useIsMobile()
	const navigate = useNavigate()
	const [topic, setTopic] = useState<Topic | null>(null)

	// Every opening starts a new conversation; the previous one stays in the study list.
	useEffect(() => {
		if (!open) setTopic(null)
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
					<SheetTitle className="flex-1 text-sm">{t("build.title")}</SheetTitle>
					<SheetDescription className="sr-only">{t("build.introText")}</SheetDescription>
					{topic ? (
						<Button
							variant="ghost"
							size="sm"
							className="h-7 gap-1 px-2 text-xs text-muted-foreground"
							onClick={() =>
								navigate({
									name: RouteName.PersonaResearchStudy,
									params: { topicId: topic.id },
								})
							}
						>
							<SquareArrowOutUpRight className="size-3.5" />
							{t("build.openInStudio")}
						</Button>
					) : null}
				</SheetHeader>
				<div className="flex min-h-0 flex-1 flex-col">
					{topic ? (
						<ResearchConversationPanel variant={isMobile ? "mobile" : "desktop"} />
					) : (
						<BuildIntro onStarted={setTopic} />
					)}
				</div>
				{savedPersonas.length ? (
					<SavedBar personas={savedPersonas} onStartStudy={onStartStudy} />
				) : null}
			</SheetContent>
		</Sheet>
	)
}

/** First screen: what the AI can build from, and a composer prefilled with the request. */
const BuildIntro = observer(function BuildIntro({
	onStarted,
}: {
	onStarted: (topic: Topic) => void
}) {
	const { t } = useTranslation("personaResearch")
	const store = usePersonaResearchStore()
	const isMobile = useIsMobile()
	const { editorContext, editorNodes, fillComposer } = useResearchEditor({
		variant: isMobile ? "mobile" : "desktop",
		selectedTopic: null,
		showLoading: false,
		messagesLength: 0,
		onStudyStarted: onStarted,
		onEditorReady: useMemoizedFn(() => fillComposer(t("build.prompt"))),
	})
	// Own draft slot, so text typed here never shows up in the research home composer.
	const context = useMemo(
		() => ({
			...editorContext,
			draftKey: editorContext.draftKey
				? { ...editorContext.draftKey, topicId: "persona-build" }
				: undefined,
		}),
		[editorContext],
	)
	const tips = [
		{ icon: FileUp, text: t("build.tipUpload") },
		{ icon: ClipboardPaste, text: t("build.tipPaste") },
		{ icon: Target, text: t("build.tipDescribe") },
	]

	return (
		<>
			<ScrollArea className="min-h-0 flex-1">
				<div className="flex flex-col items-center px-8 py-10 text-center">
					<span className="mb-3 flex size-10 items-center justify-center rounded-xl bg-muted">
						<Sparkles className="size-4" />
					</span>
					<div className="text-sm font-medium">{t("build.introTitle")}</div>
					<p className="mt-1 max-w-[340px] text-xs leading-5 text-muted-foreground">
						{t("build.introText")}
					</p>
					<ul className="mt-5 grid w-full max-w-[380px] gap-2 text-left">
						{tips.map(({ icon: Icon, text }) => (
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
					{t("build.disclaimer")}
				</p>
			</div>
		</>
	)
})

/** Positive feedback once the agent has saved personas: who arrived, and the next step. */
function SavedBar({
	personas,
	onStartStudy,
}: {
	personas: PersonaFile[]
	onStartStudy: (personaIds: string[]) => void
}) {
	const { t } = useTranslation("personaResearch")
	return (
		<div className="flex shrink-0 items-center gap-3 border-t border-border bg-emerald-500/[0.05] px-4 py-2.5 animate-in fade-in-0 motion-reduce:animate-none">
			<span className="flex -space-x-1.5">
				{personas.slice(0, 5).map((persona) => (
					<PersonaAvatar
						key={persona.id}
						id={persona.id}
						name={persona.name}
						className="size-7 border-2 border-background text-[10px]"
					/>
				))}
			</span>
			<span className="min-w-0 flex-1 truncate text-xs text-foreground">
				{t("build.saved", { count: personas.length })}
			</span>
			<Button size="sm" onClick={() => onStartStudy(personas.map((persona) => persona.id))}>
				{t("build.startStudy")}
				<ArrowRight className="size-3.5" />
			</Button>
		</div>
	)
}

export default observer(PersonaBuildSheet)
