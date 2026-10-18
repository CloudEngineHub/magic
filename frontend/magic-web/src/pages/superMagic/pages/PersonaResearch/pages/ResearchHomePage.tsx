import { useEffect, useState } from "react"
import { useMemoizedFn } from "ahooks"
import {
	ArrowRight,
	ClipboardCheck,
	ListChecks,
	MessageSquareQuote,
	Quote,
	UsersRound,
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
import ResearchComposerOptions from "../components/ResearchComposerOptions"
import ResearchVoiceCard from "../components/ResearchVoiceCard"
import {
	DEFAULT_RESEARCH_OPTIONS,
	parseResearchOptions,
	researchSettingsLine,
	type ResearchOptions,
} from "../services/researchOptions"
import StudyListItem from "../components/StudyListItem"
import { PRESSABLE } from "../components/surface"

/** Research home: ask a business question, pick a template, or reopen a study. */
function ResearchHomePage() {
	const { t } = useTranslation("personaResearch")
	const store = usePersonaResearchStore()
	const navigate = useNavigate()
	const isMobile = useIsMobile()
	const templates = useResearchTemplates()
	const [pendingDelete, setPendingDelete] = useState<Topic | null>(null)

	// The home composer always starts a new study, never continues the last opened one.
	useEffect(() => {
		store.selectStudy(undefined)
	}, [store])

	const openStudy = useMemoizedFn((topic: Topic) => {
		navigate({ name: RouteName.PersonaResearchStudy, params: { topicId: topic.id } })
	})

	// Study settings beside the composer; remembered per browser as a convenience only.
	const [options, setOptions] = useState<ResearchOptions>(readSavedOptions)
	const updateOptions = useMemoizedFn((next: ResearchOptions) => {
		setOptions(next)
		try {
			localStorage.setItem(OPTIONS_STORAGE_KEY, JSON.stringify(next))
		} catch {
			// Storage can be unavailable (private mode); the settings still apply to this send.
		}
	})

	const { editorContext, editorNodes, fillComposer } = useResearchEditor({
		variant: isMobile ? "mobile" : "desktop",
		selectedTopic: null,
		showLoading: false,
		messagesLength: 0,
		onStudyStarted: openStudy,
		// Fixed settings travel as one 【研究设置】 line at the end of the first message.
		appendToMessage: useMemoizedFn(() => researchSettingsLine(options)),
		bareContainer: true,
		onEditorReady: useMemoizedFn(() => {
			const text = store.consumePendingComposerText()
			if (text) fillComposer(text)
		}),
	})

	/** Templates sit below the fold on small screens; bring the composer back into view. */
	const applyStarter = useMemoizedFn((prompt: string, preset?: ResearchOptions) => {
		fillComposer(prompt)
		if (preset) updateOptions(preset)
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
			{/* Page bar: product name on the left, the persona library on the right. */}
			<div
				className={cn(
					"flex h-14 items-center gap-3 border-b border-border text-[13px]",
					isMobile ? "px-4" : "px-10",
				)}
			>
				<span className="font-bold text-foreground">{t("home.barTitle")}</span>
				<span className="truncate text-muted-foreground">{t("home.barSubtitle")}</span>
				<button
					type="button"
					className={cn(
						"group ml-auto flex h-8 shrink-0 items-center gap-2 rounded-lg px-2.5 text-[13px] text-foreground outline-none ring-1 ring-border transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
						PRESSABLE,
					)}
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
						{libraryPersonas.length === 0 ? <UsersRound className="size-4" /> : null}
					</span>
					{t("home.personaLibraryLabel")}
					<span className="font-mono text-xs text-muted-foreground">
						{libraryPersonas.length}
					</span>
				</button>
			</div>
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
						<h1
							className={cn(
								"font-black leading-[1.05] tracking-[-0.035em] text-foreground",
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
							{/* Settings strip inside the composer box, as in the prototype's bottom bar. */}
							<ResearchComposerOptions
								value={options}
								onChange={updateOptions}
								className="px-3 pb-3"
								trailing={
									<button
										type="button"
										className="ml-auto inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
										onClick={openLibrary}
									>
										<UsersRound className="size-3.5" />
										{t("options.pickFromLibrary")}
									</button>
								}
							/>
						</div>
						{/* What every study promises, in place of decorative value-prop tiles. */}
						<div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px] text-muted-foreground">
							<span className="inline-flex items-center gap-1.5">
								<ListChecks className="size-3.5" />
								{t("home.promise.clarify")}
							</span>
							<span className="inline-flex items-center gap-1.5">
								<Quote className="size-3.5" />
								{t("home.promise.quotes")}
							</span>
							<span className="inline-flex items-center gap-1.5">
								<ClipboardCheck className="size-3.5" />
								{t("home.promise.validate")}
							</span>
						</div>
					</div>
					{isMobile ? null : (
						<ResearchVoiceCard personas={libraryPersonas} onOpenLibrary={openLibrary} />
					)}
				</section>

				<section className="flex flex-col gap-4">
					<SectionTitle title={t("home.templatesTitle")} hint={t("home.templatesHint")} />
					<div
						className={cn(
							"grid gap-3",
							isMobile
								? "grid-cols-1"
								: "grid-cols-[repeat(auto-fill,minmax(260px,1fr))]",
						)}
					>
						{templates.map(
							({
								id,
								kicker,
								method,
								title,
								description,
								prompt,
								options: preset,
							}) => (
								<button
									key={id}
									type="button"
									className={cn(
										"group flex flex-col gap-1.5 rounded-xl bg-card p-[18px] text-left outline-none ring-1 ring-border",
										"transition-all duration-200 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-px hover:shadow-[0_6px_18px_-10px_rgb(0_0_0/0.3)] active:scale-[0.98]",
										"focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transform-none motion-reduce:transition-none",
									)}
									onClick={() => applyStarter(prompt, preset)}
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
									<span className="mt-2 flex items-center gap-1 border-t border-dashed border-border pt-3 text-xs text-muted-foreground">
										<span className="truncate">
											{[
												preset?.panelSize && preset.panelSize !== "auto"
													? t("options.panelValue", {
															count: preset.panelSize,
														})
													: null,
												preset?.rounds && preset.rounds !== "auto"
													? t("options.roundsValue", {
															count: preset.rounds,
														})
													: null,
												method,
											]
												.filter(Boolean)
												.join(" · ")}
										</span>
										<ArrowRight className="ml-auto size-3.5 shrink-0 opacity-0 transition-[opacity,transform] group-hover:translate-x-0.5 group-hover:opacity-100" />
									</span>
								</button>
							),
						)}
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

const OPTIONS_STORAGE_KEY = "persona-research:composer-options"

function readSavedOptions(): ResearchOptions {
	try {
		const raw = localStorage.getItem(OPTIONS_STORAGE_KEY)
		return raw ? parseResearchOptions(JSON.parse(raw)) : DEFAULT_RESEARCH_OPTIONS
	} catch {
		return DEFAULT_RESEARCH_OPTIONS
	}
}

export default observer(ResearchHomePage)
