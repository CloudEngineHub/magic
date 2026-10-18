import { useEffect, useState } from "react"
import { useMemoizedFn } from "ahooks"
import { ArrowRight, ChevronRight, MessageSquareQuote, UsersRound } from "lucide-react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/shadcn-ui/alert-dialog"
import { Button } from "@/components/shadcn-ui/button"
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/shadcn-ui/empty"
import { ScrollArea } from "@/components/shadcn-ui/scroll-area"
import DefaultMessageEditorContainer from "@/pages/superMagic/components/MainInputContainer/components/editors/DefaultMessageEditorContainer"
import MobileInputContainer from "@/pages/superMagicMobile/pages/ChatPage/components/MobileInputContainer"
import type { Topic } from "@/pages/superMagic/pages/Workspace/types"
import { useIsMobile } from "@/hooks/useIsMobile"
import { useNavigate } from "@/routes/hooks/useNavigate"
import { RouteName } from "@/routes/constants"
import { cn } from "@/utils/cn"
import { usePersonaResearchStore } from "../context"
import { useResearchEditor } from "../hooks/useResearchEditor"
import { useResearchTemplates } from "../hooks/useResearchTemplates"
import PersonaAvatar from "../components/PersonaAvatar"
import ResearchVoiceCard from "../components/ResearchVoiceCard"
import StudyListItem from "../components/StudyListItem"

/** Research home: ask a business question, pick a template, or reopen a study. */
function ResearchHomePage() {
	const { t } = useTranslation("personaResearch")
	const store = usePersonaResearchStore()
	const navigate = useNavigate()
	const isMobile = useIsMobile()
	const { scenarios, templates } = useResearchTemplates()
	const [pendingDelete, setPendingDelete] = useState<Topic | null>(null)

	// The home composer always starts a new study, never continues the last opened one.
	useEffect(() => {
		store.selectStudy(undefined)
	}, [store])

	const openStudy = useMemoizedFn((topic: Topic) => {
		navigate({ name: RouteName.PersonaResearchStudy, params: { topicId: topic.id } })
	})

	const { editorContext, editorNodes, fillComposer } = useResearchEditor({
		variant: isMobile ? "mobile" : "desktop",
		selectedTopic: null,
		showLoading: false,
		messagesLength: 0,
		onStudyStarted: openStudy,
		onEditorReady: useMemoizedFn(() => {
			const text = store.consumePendingComposerText()
			if (text) fillComposer(text)
		}),
	})

	/** Templates sit below the fold on small screens; bring the composer back into view. */
	const applyStarter = useMemoizedFn((prompt: string) => {
		fillComposer(prompt)
		document
			.querySelector('[data-testid="persona-research-composer"]')
			?.scrollIntoView({ behavior: "smooth", block: "center" })
	})

	const confirmDelete = useMemoizedFn(async () => {
		const topic = pendingDelete
		setPendingDelete(null)
		if (!topic) return
		try {
			await store.deleteStudy(topic.id)
			toast.success(t("home.deleted"))
		} catch {
			toast.error(t("home.deleteFailed"))
		}
	})

	const studies = store.studies
	const libraryPersonas = store.personas.map((ref) => ref.data)
	const openLibrary = useMemoizedFn(() => navigate({ name: RouteName.PersonaResearchPersonas }))

	return (
		<ScrollArea className="h-full bg-background" data-testid="persona-research-home">
			<div
				className={cn(
					"mx-auto flex w-full max-w-6xl flex-col",
					isMobile ? "gap-8 px-4 py-6" : "gap-14 px-10 pb-16 pt-12",
				)}
			>
				{/* Hero: the question on the left, a real persona voice on the right. */}
				<section
					className={cn(
						"grid items-stretch",
						isMobile ? "grid-cols-1 gap-6" : "grid-cols-[minmax(0,1fr)_380px] gap-12",
					)}
				>
					<div className="flex min-w-0 flex-col">
						<span className="text-xs tracking-wide text-muted-foreground">
							{t("home.eyebrow")}
						</span>
						<h1
							className={cn(
								"mt-3 font-black leading-[1.05] tracking-[-0.035em] text-foreground",
								isMobile ? "text-4xl" : "text-[64px]",
							)}
						>
							{t("home.title")}
						</h1>
						<p className="mt-4 max-w-[30em] text-[15px] leading-7 text-muted-foreground">
							{t("home.subtitle")}
						</p>
						<div
							className="mt-7 rounded-2xl bg-background shadow-[0_1px_2px_rgb(0_0_0/0.04),0_8px_24px_-12px_rgb(0_0_0/0.14)] ring-1 ring-border transition-shadow focus-within:shadow-[0_10px_30px_-12px_rgb(0_0_0/0.24)] focus-within:ring-foreground/70"
							data-testid="persona-research-composer"
						>
							{isMobile ? (
								<MobileInputContainer
									editorContext={editorContext}
									editorNodes={editorNodes}
								/>
							) : (
								<DefaultMessageEditorContainer
									editorContext={editorContext}
									editorNodes={editorNodes}
								/>
							)}
						</div>
						<div className="mt-3 flex flex-wrap gap-1.5">
							{scenarios.map(({ id, title, prompt }) => (
								<button
									key={id}
									type="button"
									className="rounded-full px-2.5 py-1 text-xs text-muted-foreground outline-none ring-1 ring-border transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
									onClick={() => applyStarter(prompt)}
								>
									{title}
								</button>
							))}
						</div>
					</div>
					{isMobile ? null : (
						<ResearchVoiceCard personas={libraryPersonas} onOpenLibrary={openLibrary} />
					)}
				</section>

				<section className="flex flex-col gap-4">
					<SectionTitle title={t("home.templates")} hint={t("home.templatesHint")} />
					<div
						className={cn(
							"grid gap-3",
							isMobile
								? "grid-cols-1"
								: "grid-cols-[repeat(auto-fill,minmax(260px,1fr))]",
						)}
					>
						{templates.map(({ id, kicker, title, description, prompt }) => (
							<button
								key={id}
								type="button"
								className={cn(
									"group flex flex-col gap-1.5 rounded-xl bg-card p-[18px] text-left outline-none ring-1 ring-border",
									"transition-all duration-150 hover:-translate-y-px hover:shadow-[0_6px_18px_-10px_rgb(0_0_0/0.3)]",
									"focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transform-none motion-reduce:transition-none",
								)}
								onClick={() => applyStarter(prompt)}
							>
								<span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
									{kicker}
								</span>
								<span className="text-[15px] font-bold text-foreground">
									{title}
								</span>
								<span className="line-clamp-2 text-[13px] leading-6 text-muted-foreground">
									{description}
								</span>
								<span className="mt-2 flex items-center gap-1 border-t border-dashed border-border pt-3 text-xs text-muted-foreground transition-colors group-hover:text-foreground">
									{t("home.useTemplate")}
									<ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
								</span>
							</button>
						))}
					</div>
				</section>

				<section className="flex flex-col gap-4">
					<div className="flex items-center justify-between gap-3">
						<SectionTitle
							title={t("home.myStudies")}
							hint={
								studies.length > 0
									? t("home.studiesCount", { count: studies.length })
									: undefined
							}
						/>
						<button
							type="button"
							className="group flex items-center gap-2 rounded-full px-2 py-1 text-xs text-muted-foreground outline-none ring-1 ring-border transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
							onClick={openLibrary}
						>
							<span className="flex -space-x-1.5">
								{libraryPersonas.slice(0, 3).map((persona) => (
									<PersonaAvatar
										key={persona.id}
										id={persona.id}
										name={persona.name}
										className="size-5 ring-2 ring-background"
									/>
								))}
								{libraryPersonas.length === 0 ? (
									<UsersRound className="size-4" />
								) : null}
							</span>
							{t("home.personaLibrary", { count: libraryPersonas.length })}
							<ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
						</button>
					</div>
					{studies.length === 0 ? (
						<Empty className="rounded-xl border border-dashed border-border py-10">
							<EmptyHeader>
								<EmptyMedia variant="icon">
									<MessageSquareQuote />
								</EmptyMedia>
								<EmptyTitle>{t("home.emptyTitle")}</EmptyTitle>
								<EmptyDescription>{t("home.noStudies")}</EmptyDescription>
							</EmptyHeader>
							<EmptyContent>
								<Button
									variant="outline"
									size="sm"
									onClick={() => applyStarter(t("home.samplePrompt"))}
								>
									{t("home.trySample")}
								</Button>
							</EmptyContent>
						</Empty>
					) : (
						<ul className="flex flex-col divide-y divide-border border-y border-border">
							{studies.map((topic) => (
								<StudyListItem
									key={topic.id}
									topic={topic}
									onOpen={openStudy}
									onDelete={setPendingDelete}
								/>
							))}
						</ul>
					)}
				</section>
			</div>

			<AlertDialog
				open={Boolean(pendingDelete)}
				onOpenChange={(open) => !open && setPendingDelete(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{t("home.deleteTitle")}</AlertDialogTitle>
						<AlertDialogDescription>
							{t("home.deleteDescription")}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive text-white hover:bg-destructive/90"
							onClick={() => void confirmDelete()}
						>
							{t("home.delete")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</ScrollArea>
	)
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
	return (
		<div className="flex items-baseline gap-3">
			<h2 className="text-lg font-bold tracking-tight text-foreground">{title}</h2>
			{hint ? <span className="text-[13px] text-muted-foreground">{hint}</span> : null}
		</div>
	)
}

export default observer(ResearchHomePage)
