import { useEffect, useState } from "react"
import { useMemoizedFn } from "ahooks"
import {
	ArrowUpRight,
	ChevronRight,
	Quote,
	Sparkles,
	UserCheck,
	UsersRound,
	Workflow,
} from "lucide-react"
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
import ResearchHeroBackdrop from "../components/ResearchHeroBackdrop"
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
	const valueProps = [
		{ icon: Workflow, title: t("home.value.process"), text: t("home.value.processText") },
		{ icon: Quote, title: t("home.value.evidence"), text: t("home.value.evidenceText") },
		{ icon: UserCheck, title: t("home.value.validate"), text: t("home.value.validateText") },
	]

	return (
		<ScrollArea className="h-full bg-background" data-testid="persona-research-home">
			<div className="relative">
				<ResearchHeroBackdrop />
				<div
					className={cn(
						"relative mx-auto flex w-full max-w-4xl flex-col",
						isMobile ? "gap-6 px-4 py-6" : "gap-10 px-6 pb-14 pt-14",
					)}
				>
					<header className="flex flex-col items-center gap-3 text-center">
						<span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/80 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
							<Sparkles className="size-3.5 text-primary" />
							{t("home.eyebrow")}
						</span>
						<h1
							className={cn(
								"text-balance font-semibold tracking-tight text-foreground",
								isMobile ? "text-2xl" : "text-4xl",
							)}
						>
							{t("home.title")}
						</h1>
						<p className="max-w-2xl text-balance text-sm leading-6 text-muted-foreground">
							{t("home.subtitle")}
						</p>
					</header>

					<section className="flex flex-col gap-4">
						<div
							className="rounded-xl bg-background shadow-sm transition-shadow focus-within:shadow-md"
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
						<div className="flex flex-wrap justify-center gap-2">
							{scenarios.map(({ id, icon: Icon, title, prompt }) => (
								<Button
									key={id}
									variant="outline"
									size="sm"
									className="h-8 rounded-full bg-background/80 text-xs text-muted-foreground hover:text-foreground"
									onClick={() => applyStarter(prompt)}
								>
									<Icon className="size-3.5" />
									{title}
								</Button>
							))}
						</div>
						{isMobile ? null : (
							<ul className="grid grid-cols-3 gap-3 pt-2">
								{valueProps.map(({ icon: Icon, title, text }) => (
									<li key={title} className="flex items-start gap-2.5">
										<span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
											<Icon className="size-4" />
										</span>
										<span className="flex flex-col gap-0.5">
											<span className="text-sm font-medium text-foreground">
												{title}
											</span>
											<span className="text-xs leading-5 text-muted-foreground">
												{text}
											</span>
										</span>
									</li>
								))}
							</ul>
						)}
					</section>

					<section className="flex flex-col gap-3">
						<SectionTitle title={t("home.templates")} hint={t("home.templatesHint")} />
						<div
							className={cn(
								"grid gap-3",
								isMobile
									? "grid-cols-1"
									: "grid-cols-[repeat(auto-fill,minmax(220px,1fr))]",
							)}
						>
							{templates.map(({ id, icon: Icon, title, description, prompt }) => (
								<button
									key={id}
									type="button"
									className={cn(
										"group flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-left outline-none",
										"transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md",
										"focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transform-none motion-reduce:transition-none",
									)}
									onClick={() => applyStarter(prompt)}
								>
									<span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
										<Icon className="size-4" />
									</span>
									<span className="flex min-w-0 flex-1 flex-col gap-1">
										<span className="flex items-center gap-1 text-sm font-medium text-foreground">
											{title}
											<ArrowUpRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
										</span>
										<span className="line-clamp-2 text-xs leading-5 text-muted-foreground">
											{description}
										</span>
									</span>
								</button>
							))}
						</div>
					</section>

					<section className="flex flex-col gap-3">
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
								className="group flex items-center gap-2 rounded-full border border-border px-2 py-1 text-xs text-muted-foreground outline-none transition-colors hover:border-primary/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
								onClick={() =>
									navigate({ name: RouteName.PersonaResearchPersonas })
								}
							>
								<span className="flex -space-x-1.5">
									{store.personas.slice(0, 3).map((ref) => (
										<PersonaAvatar
											key={ref.data.id}
											id={ref.data.id}
											name={ref.data.name}
											className="size-5 border-2 border-background text-[9px]"
										/>
									))}
									{store.personas.length === 0 ? (
										<UsersRound className="size-4" />
									) : null}
								</span>
								{t("home.personaLibrary", { count: store.personas.length })}
								<ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
							</button>
						</div>
						{studies.length === 0 ? (
							<Empty className="rounded-xl border border-dashed border-border py-10">
								<EmptyHeader>
									<EmptyMedia variant="icon">
										<Sparkles />
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
							<ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
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
		<div className="flex items-baseline gap-2">
			<h2 className="text-sm font-semibold text-foreground">{title}</h2>
			{hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
		</div>
	)
}

export default observer(ResearchHomePage)
