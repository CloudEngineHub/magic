import { useMemo, useState } from "react"
import { useMemoizedFn } from "ahooks"
import { ArrowLeft, ArrowRight, LibraryBig, Search, SearchX, UsersRound, X } from "lucide-react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/shadcn-ui/empty"
import { Input } from "@/components/shadcn-ui/input"
import { ScrollArea } from "@/components/shadcn-ui/scroll-area"
import { Tabs, TabsList, TabsTrigger } from "@/components/shadcn-ui/tabs"
import MagicTooltip from "@/components/base/MagicTooltip"
import { useIsMobile } from "@/hooks/useIsMobile"
import { useNavigate } from "@/routes/hooks/useNavigate"
import { RouteName } from "@/routes/constants"
import { cn } from "@/utils/cn"
import { usePersonaResearchStore } from "../context"
import PersonaAvatar from "../components/PersonaAvatar"
import PersonaCard from "../components/PersonaCard"
import PersonaDetailSheet from "../components/PersonaDetailSheet"
import type { PersonaFile, PersonaTier } from "../types"

type TierFilter = "all" | PersonaTier

/** Persona library: browse reusable personas and panels, then start a study with them. */
function PersonaLibraryPage() {
	const { t } = useTranslation("personaResearch")
	const store = usePersonaResearchStore()
	const navigate = useNavigate()
	const isMobile = useIsMobile()
	const [view, setView] = useState<"personas" | "panels">("personas")
	const [tier, setTier] = useState<TierFilter>("all")
	const [keyword, setKeyword] = useState("")
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
	const [openedPersona, setOpenedPersona] = useState<PersonaFile | null>(null)

	const pathById = useMemo(
		() => new Map(store.personas.map((ref) => [ref.data.id, ref.path])),
		[store.personas],
	)

	const tierCounts = useMemo(() => {
		const counts: Record<TierFilter, number> = {
			all: store.personas.length,
			evidence_based: 0,
			imported: 0,
			generated: 0,
		}
		for (const ref of store.personas) counts[ref.data.tier] += 1
		return counts
	}, [store.personas])

	/** Newest personas first, so the ones from the latest study are on top. */
	const filtered = useMemo(() => {
		const query = keyword.trim().toLowerCase()
		return store.personas
			.map((ref) => ref.data)
			.filter((persona) => tier === "all" || persona.tier === tier)
			.filter((persona) => {
				if (!query) return true
				return [persona.name, persona.tagline ?? "", ...(persona.tags ?? [])]
					.join(" ")
					.toLowerCase()
					.includes(query)
			})
			.sort((a, b) => String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")))
	}, [keyword, store.personas, tier])

	/** Prefills the home composer with the chosen persona files so the agent reuses them. */
	const startStudyWith = useMemoizedFn((personaIds: string[]) => {
		const paths = personaIds
			.map((id) => pathById.get(id))
			.filter((path): path is string => Boolean(path))
		if (paths.length === 0) return
		store.setPendingComposerText(t("library.startPrompt", { paths: paths.join("\n") }))
		navigate({ name: RouteName.PersonaResearch })
	})

	const toggleSelected = useMemoizedFn((id: string, selected: boolean) => {
		setSelectedIds((current) => {
			const next = new Set(current)
			if (selected) next.add(id)
			else next.delete(id)
			return next
		})
	})

	const tierTabs: { value: TierFilter; label: string }[] = [
		{ value: "all", label: t("library.tierAll") },
		{ value: "evidence_based", label: t("persona.tier.evidenceBased") },
		{ value: "imported", label: t("persona.tier.imported") },
		{ value: "generated", label: t("persona.tier.generated") },
	]
	const selectedPersonas = [...selectedIds]
		.map((id) => store.personaById(id))
		.filter((persona): persona is PersonaFile => persona !== null)

	return (
		<div
			className="relative flex h-full min-h-0 flex-col bg-background"
			data-testid="persona-research-library"
		>
			<div className="flex shrink-0 flex-col gap-3 border-b border-border px-4 py-3">
				<div className="flex items-center gap-2">
					<MagicTooltip title={t("study.backHome")}>
						<Button
							variant="ghost"
							size="icon"
							className="size-8"
							aria-label={t("study.backHome")}
							onClick={() => navigate({ name: RouteName.PersonaResearch })}
						>
							<ArrowLeft className="size-4" />
						</Button>
					</MagicTooltip>
					<div className="flex flex-1 flex-col">
						<h1 className="text-sm font-semibold">{t("library.title")}</h1>
						<p className="text-xs text-muted-foreground">{t("library.subtitle")}</p>
					</div>
				</div>
				<div className={cn("flex gap-2", isMobile ? "flex-col" : "items-center")}>
					<Tabs value={view} onValueChange={(value) => setView(value as typeof view)}>
						<TabsList>
							<TabsTrigger value="personas" className="gap-1.5">
								<UsersRound className="size-3.5" />
								{t("library.personas")}
								<CountBadge value={store.personas.length} />
							</TabsTrigger>
							<TabsTrigger value="panels" className="gap-1.5">
								<LibraryBig className="size-3.5" />
								{t("library.panels")}
								<CountBadge value={store.panels.length} />
							</TabsTrigger>
						</TabsList>
					</Tabs>
					{view === "personas" ? (
						<>
							<div className="flex flex-wrap gap-1">
								{tierTabs.map(({ value, label }) => (
									<button
										key={value}
										type="button"
										aria-pressed={tier === value}
										onClick={() => setTier(value)}
										className={cn(
											"flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
											tier === value
												? "border-primary bg-primary/10 text-primary"
												: "border-border text-muted-foreground hover:text-foreground",
										)}
									>
										{label}
										<span className="tabular-nums opacity-70">
											{tierCounts[value]}
										</span>
									</button>
								))}
							</div>
							<div className="relative flex-1">
								<Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
								<Input
									value={keyword}
									onChange={(event) => setKeyword(event.target.value)}
									placeholder={t("library.search")}
									className="h-8 pl-8"
								/>
							</div>
						</>
					) : null}
				</div>
			</div>

			<ScrollArea className="min-h-0 flex-1">
				{view === "personas" ? (
					filtered.length === 0 ? (
						store.personas.length === 0 ? (
							<LibraryEmpty
								icon={<UsersRound />}
								title={t("library.emptyTitle")}
								text={t("library.empty")}
								action={
									<Button
										variant="outline"
										size="sm"
										onClick={() =>
											navigate({ name: RouteName.PersonaResearch })
										}
									>
										{t("library.goStudy")}
									</Button>
								}
							/>
						) : (
							<LibraryEmpty
								icon={<SearchX />}
								title={t("library.noMatchTitle")}
								text={t("library.noMatch")}
								action={
									<Button
										variant="outline"
										size="sm"
										onClick={() => {
											setKeyword("")
											setTier("all")
										}}
									>
										{t("library.resetFilters")}
									</Button>
								}
							/>
						)
					) : (
						<div
							className={cn(
								"grid gap-3 p-4",
								isMobile
									? "grid-cols-1"
									: "grid-cols-[repeat(auto-fill,minmax(210px,1fr))]",
								// Leave room for the floating selection bar.
								selectedIds.size > 0 && "pb-24",
							)}
						>
							{filtered.map((persona) => (
								<PersonaCard
									key={persona.id}
									persona={persona}
									selectable
									selected={selectedIds.has(persona.id)}
									onSelectedChange={(selected) =>
										toggleSelected(persona.id, selected)
									}
									onOpen={() => setOpenedPersona(persona)}
								/>
							))}
						</div>
					)
				) : store.panels.length === 0 ? (
					<LibraryEmpty
						icon={<LibraryBig />}
						title={t("library.panelsEmptyTitle")}
						text={t("library.panelsEmpty")}
					/>
				) : (
					<ul
						className={cn(
							"grid gap-3 p-4",
							isMobile
								? "grid-cols-1"
								: "grid-cols-[repeat(auto-fill,minmax(320px,1fr))]",
						)}
					>
						{store.panels.map((ref) => (
							<li
								key={ref.fileId}
								className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-shadow hover:shadow-md"
							>
								<div className="min-w-0">
									<div className="truncate text-sm font-semibold">
										{ref.data.name}
									</div>
									{ref.data.criteria ? (
										<div className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground">
											{ref.data.criteria}
										</div>
									) : null}
								</div>
								<div className="flex items-center justify-between gap-3">
									<span className="flex items-center gap-2">
										<span className="flex -space-x-1.5">
											{ref.data.persona_ids.slice(0, 6).map((id) => (
												<PersonaAvatar
													key={id}
													id={id}
													name={store.personaById(id)?.name ?? id}
													className="size-7 border-2 border-card text-[10px]"
												/>
											))}
										</span>
										<span className="text-xs text-muted-foreground">
											{t("library.panelSize", {
												count: ref.data.persona_ids.length,
											})}
										</span>
									</span>
									<Button
										size="sm"
										variant="outline"
										onClick={() => startStudyWith(ref.data.persona_ids)}
									>
										{t("library.startWithPanel")}
										<ArrowRight className="size-3.5" />
									</Button>
								</div>
							</li>
						))}
					</ul>
				)}
			</ScrollArea>

			{view === "personas" && selectedPersonas.length > 0 ? (
				// Floating bar keeps the grid visible while personas are being picked.
				<div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4">
					<div className="pointer-events-auto flex w-full max-w-xl items-center gap-3 rounded-2xl border border-border bg-background/95 px-3 py-2.5 shadow-lg backdrop-blur animate-in fade-in-0 slide-in-from-bottom-2 motion-reduce:animate-none">
						<span className="flex -space-x-1.5">
							{selectedPersonas.slice(0, 5).map((persona) => (
								<PersonaAvatar
									key={persona.id}
									id={persona.id}
									name={persona.name}
									className="size-7 border-2 border-background text-[10px]"
								/>
							))}
						</span>
						<span className="min-w-0 flex-1 truncate text-sm">
							{t("library.selected", { count: selectedPersonas.length })}
						</span>
						<MagicTooltip title={t("library.clearSelection")}>
							<Button
								variant="ghost"
								size="icon"
								className="size-8"
								aria-label={t("library.clearSelection")}
								onClick={() => setSelectedIds(new Set())}
							>
								<X className="size-4" />
							</Button>
						</MagicTooltip>
						<Button
							size="sm"
							onClick={() =>
								startStudyWith(selectedPersonas.map((persona) => persona.id))
							}
						>
							{t("library.startWithSelected")}
							<ArrowRight className="size-3.5" />
						</Button>
					</div>
				</div>
			) : null}

			<PersonaDetailSheet
				persona={openedPersona}
				onOpenChange={(open) => !open && setOpenedPersona(null)}
				side={isMobile ? "bottom" : "right"}
			/>
		</div>
	)
}

function CountBadge({ value }: { value: number }) {
	if (value <= 0) return null
	return (
		<span className="rounded-full bg-muted px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground">
			{value}
		</span>
	)
}

function LibraryEmpty({
	icon,
	title,
	text,
	action,
}: {
	icon: React.ReactNode
	title: string
	text: string
	action?: React.ReactNode
}) {
	return (
		<Empty className="py-16">
			<EmptyHeader>
				<EmptyMedia variant="icon">{icon}</EmptyMedia>
				<EmptyTitle>{title}</EmptyTitle>
				<EmptyDescription>{text}</EmptyDescription>
			</EmptyHeader>
			{action ? <EmptyContent>{action}</EmptyContent> : null}
		</Empty>
	)
}

export default observer(PersonaLibraryPage)
