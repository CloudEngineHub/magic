import { useEffect, useState } from "react"
import { useMemoizedFn } from "ahooks"
import dayjs from "dayjs"
import { ChevronRight, Ellipsis, Trash2, UsersRound } from "lucide-react"
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
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/shadcn-ui/dropdown-menu"
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
import type { StudyPhase } from "../types"

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

	const phaseLabel = useMemoizedFn((phase: StudyPhase | null) => {
		switch (phase) {
			case "clarify":
				return t("phase.clarify")
			case "plan":
				return t("phase.plan")
			case "desk_research":
				return t("phase.deskResearch")
			case "interview":
				return t("phase.interview")
			case "report":
				return t("phase.report")
			case "validation":
				return t("phase.validation")
			case "done":
				return t("phase.done")
			default:
				return t("phase.notStarted")
		}
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

	return (
		<ScrollArea className="h-full bg-background" data-testid="persona-research-home">
			<div
				className={cn(
					"mx-auto flex w-full max-w-4xl flex-col gap-8",
					isMobile ? "px-4 py-6" : "px-6 py-12",
				)}
			>
				<header className="flex flex-col gap-2 text-center">
					<h1
						className={cn(
							"font-semibold text-foreground",
							isMobile ? "text-xl" : "text-3xl",
						)}
					>
						{t("home.title")}
					</h1>
					<p className="text-sm text-muted-foreground">{t("home.subtitle")}</p>
				</header>

				<section className="flex flex-col gap-3">
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
					<div className="flex flex-wrap justify-center gap-2">
						{scenarios.map((scenario) => (
							<Button
								key={scenario.id}
								variant="outline"
								size="sm"
								className="rounded-full"
								onClick={() => fillComposer(scenario.prompt)}
							>
								{scenario.title}
							</Button>
						))}
					</div>
				</section>

				<section className="flex flex-col gap-3">
					<h2 className="text-sm font-medium text-foreground">{t("home.templates")}</h2>
					<div className={cn("grid gap-3", isMobile ? "grid-cols-1" : "grid-cols-3")}>
						{templates.map((template) => (
							<button
								key={template.id}
								type="button"
								className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								onClick={() => fillComposer(template.prompt)}
							>
								<span className="text-sm font-medium">{template.title}</span>
								<span className="line-clamp-2 text-xs text-muted-foreground">
									{template.description}
								</span>
							</button>
						))}
					</div>
				</section>

				<section className="flex flex-col gap-3">
					<div className="flex items-center justify-between">
						<h2 className="text-sm font-medium text-foreground">
							{t("home.myStudies")}
						</h2>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => navigate({ name: RouteName.PersonaResearchPersonas })}
						>
							<UsersRound className="size-4" />
							{t("home.personaLibrary", { count: store.personas.length })}
							<ChevronRight className="size-4" />
						</Button>
					</div>
					{studies.length === 0 ? (
						<p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
							{t("home.noStudies")}
						</p>
					) : (
						<ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
							{studies.map((topic) => (
								<li key={topic.id} className="flex items-center gap-3 px-3 py-2.5">
									<button
										type="button"
										className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										onClick={() => openStudy(topic)}
									>
										<span className="truncate text-sm text-foreground">
											{store.studyTitleOf(topic) || t("study.untitled")}
										</span>
										<span className="text-xs text-muted-foreground">
											{phaseLabel(store.studyPhaseOf(topic))}
											{topic.updated_at
												? ` · ${dayjs(topic.updated_at).format("MM-DD HH:mm")}`
												: ""}
										</span>
									</button>
									<DropdownMenu>
										<DropdownMenuTrigger asChild>
											<Button
												variant="ghost"
												size="icon"
												className="size-8"
												aria-label={t("home.moreActions")}
											>
												<Ellipsis className="size-4" />
											</Button>
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end">
											<DropdownMenuItem
												className="text-destructive"
												onSelect={() => setPendingDelete(topic)}
											>
												<Trash2 className="size-4" />
												{t("home.delete")}
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								</li>
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
						<AlertDialogAction onClick={() => void confirmDelete()}>
							{t("home.delete")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</ScrollArea>
	)
}

export default observer(ResearchHomePage)
