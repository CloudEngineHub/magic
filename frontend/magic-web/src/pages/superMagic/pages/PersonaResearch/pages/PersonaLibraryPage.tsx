import { useMemo, useState } from "react"
import { useMemoizedFn } from "ahooks"
import { ArrowLeft, Search } from "lucide-react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import { Input } from "@/components/shadcn-ui/input"
import { ScrollArea } from "@/components/shadcn-ui/scroll-area"
import { Tabs, TabsList, TabsTrigger } from "@/components/shadcn-ui/tabs"
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

	return (
		<div
			className="flex h-full min-h-0 flex-col bg-background"
			data-testid="persona-research-library"
		>
			<div className="flex shrink-0 flex-col gap-3 border-b border-border px-4 py-3">
				<div className="flex items-center gap-2">
					<Button
						variant="ghost"
						size="icon"
						className="size-8"
						aria-label={t("study.backHome")}
						onClick={() => navigate({ name: RouteName.PersonaResearch })}
					>
						<ArrowLeft className="size-4" />
					</Button>
					<h1 className="flex-1 text-sm font-medium">
						{t("library.title")}
						<span className="ml-2 text-muted-foreground">{store.personas.length}</span>
					</h1>
				</div>
				<div className={cn("flex gap-2", isMobile ? "flex-col" : "items-center")}>
					<Tabs value={view} onValueChange={(value) => setView(value as typeof view)}>
						<TabsList>
							<TabsTrigger value="personas">{t("library.personas")}</TabsTrigger>
							<TabsTrigger value="panels">
								{t("library.panels")}
								{store.panels.length > 0 ? ` ${store.panels.length}` : ""}
							</TabsTrigger>
						</TabsList>
					</Tabs>
					{view === "personas" ? (
						<>
							<Tabs
								value={tier}
								onValueChange={(value) => setTier(value as TierFilter)}
							>
								<TabsList>
									<TabsTrigger value="all">{t("library.tierAll")}</TabsTrigger>
									<TabsTrigger value="evidence_based">
										{t("persona.tier.evidenceBased")}
									</TabsTrigger>
									<TabsTrigger value="imported">
										{t("persona.tier.imported")}
									</TabsTrigger>
									<TabsTrigger value="generated">
										{t("persona.tier.generated")}
									</TabsTrigger>
								</TabsList>
							</Tabs>
							<div className="relative flex-1">
								<Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
								<Input
									value={keyword}
									onChange={(event) => setKeyword(event.target.value)}
									placeholder={t("library.search")}
									className="pl-8"
								/>
							</div>
						</>
					) : null}
				</div>
			</div>

			<ScrollArea className="min-h-0 flex-1">
				{view === "personas" ? (
					filtered.length === 0 ? (
						<p className="p-10 text-center text-sm text-muted-foreground">
							{store.personas.length === 0
								? t("library.empty")
								: t("library.noMatch")}
						</p>
					) : (
						<div
							className={cn(
								"grid gap-3 p-4",
								isMobile
									? "grid-cols-1"
									: "grid-cols-[repeat(auto-fill,minmax(200px,1fr))]",
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
					<p className="p-10 text-center text-sm text-muted-foreground">
						{t("library.panelsEmpty")}
					</p>
				) : (
					<ul className="flex flex-col gap-3 p-4">
						{store.panels.map((ref) => (
							<li
								key={ref.fileId}
								className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
							>
								<div className="min-w-0 flex-1">
									<div className="truncate text-sm font-medium">
										{ref.data.name}
									</div>
									{ref.data.criteria ? (
										<div className="line-clamp-1 text-xs text-muted-foreground">
											{ref.data.criteria}
										</div>
									) : null}
									<div className="mt-2 flex -space-x-1.5">
										{ref.data.persona_ids.slice(0, 8).map((id) => (
											<PersonaAvatar
												key={id}
												id={id}
												name={store.personaById(id)?.name ?? id}
												className="size-6 border-2 border-background text-[10px]"
											/>
										))}
									</div>
								</div>
								<Button
									size="sm"
									variant="outline"
									onClick={() => startStudyWith(ref.data.persona_ids)}
								>
									{t("library.startWithPanel")}
								</Button>
							</li>
						))}
					</ul>
				)}
			</ScrollArea>

			{view === "personas" && selectedIds.size > 0 ? (
				<div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-4 py-2.5">
					<span className="text-sm text-muted-foreground">
						{t("library.selected", { count: selectedIds.size })}
					</span>
					<div className="flex gap-2">
						<Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
							{t("library.clearSelection")}
						</Button>
						<Button size="sm" onClick={() => startStudyWith([...selectedIds])}>
							{t("library.startWithSelected")}
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

export default observer(PersonaLibraryPage)
