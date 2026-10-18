import type { ReactNode } from "react"
import {
	Brain,
	ExternalLink,
	FileText,
	FingerprintPattern,
	Globe,
	Layers,
	MessageCircleQuestion,
	MessagesSquare,
	Pencil,
	Quote,
	ShieldAlert,
	Smartphone,
	Split,
	Trash2,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import MagicTooltip from "@/components/base/MagicTooltip"
import dayjs from "@/infrastructure/vendors/dayjs"
import { ScrollArea } from "@/components/shadcn-ui/scroll-area"
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/shadcn-ui/sheet"
import { cn } from "@/utils/cn"
import type {
	InterviewFile,
	PersonaDimensionKey,
	PersonaEvidence,
	PersonaFieldSource,
	PersonaFile,
} from "../types"
import { normalizeDecisionWeights } from "../services/researchAnalysis"
import { formatResearchValue } from "./formatValue"
import { AiSimulatedNote } from "./ResearchBadges"
import PersonaAvatar from "./PersonaAvatar"
import { personaTone } from "./personaPortrait"

interface PersonaDetailSheetProps {
	persona: PersonaFile | null
	interview?: InterviewFile | null
	onOpenChange: (open: boolean) => void
	/** Prefills the composer with a follow-up question for this persona. */
	onAskPersona?: (persona: PersonaFile) => void
	onOpenInterview?: (personaId: string) => void
	/** Persona library only: open the edit form / ask to delete this persona. */
	onEdit?: (persona: PersonaFile) => void
	onDelete?: (persona: PersonaFile) => void
	side?: "right" | "bottom"
}

/** Seven dimensions, four evidence layers and sources of one persona. */
export default function PersonaDetailSheet({
	persona,
	interview,
	onOpenChange,
	onAskPersona,
	onOpenInterview,
	onEdit,
	onDelete,
	side = "right",
}: PersonaDetailSheetProps) {
	const { t } = useTranslation("personaResearch")
	const dimensions = persona?.dimensions
	const layers = persona?.layers
	const isManual = persona?.tier === "manual"
	// Every field of a manual persona is the user's, so per-field marks would only repeat the tier.
	const fieldSourceOf = (key: PersonaDimensionKey) =>
		isManual ? undefined : persona?.field_sources?.[key]
	const tierCopy = persona
		? {
				generated: {
					label: t("persona.tier.generated"),
					hint: t("persona.tierHint.generated"),
				},
				evidence_based: {
					label: t("persona.tier.evidenceBased"),
					hint: t("persona.tierHint.evidenceBased"),
				},
				imported: {
					label: t("persona.tier.imported"),
					hint: t("persona.tierHint.imported"),
				},
				manual: {
					label: t("persona.tier.manual"),
					hint: t("persona.tierHint.manual"),
				},
			}[persona.tier]
		: null
	const answeredRounds = interview?.rounds.filter((round) => round.role === "persona").length ?? 0
	const leadQuote = interview?.quotes?.[0]?.text

	return (
		<Sheet open={Boolean(persona)} onOpenChange={onOpenChange}>
			<SheetContent
				side={side}
				className={
					side === "right"
						? "flex w-full flex-col gap-0 p-0 sm:max-w-md"
						: "flex max-h-[88vh] flex-col gap-0 rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom)]"
				}
			>
				{persona && tierCopy ? (
					<>
						{/* Persona-coloured header, matching their card, quotes and transcript highlights. */}
						<SheetHeader
							className="gap-3 border-b border-border p-5"
							style={{
								backgroundColor: personaTone(persona.name || persona.id).tint,
							}}
						>
							<div className="flex items-center gap-3.5">
								<PersonaAvatar
									id={persona.id}
									name={persona.name}
									shape="square"
									className="size-16"
								/>
								<div className="min-w-0 flex-1">
									<SheetTitle className="truncate text-xl font-black tracking-tight">
										{persona.name}
									</SheetTitle>
									<SheetDescription className="line-clamp-2">
										{persona.tagline}
									</SheetDescription>
								</div>
								{onEdit || onDelete ? (
									// Right padding keeps clear of the sheet's own close button.
									<div className="flex shrink-0 items-center gap-0.5 self-start pr-7">
										{onEdit ? (
											<Button
												variant="ghost"
												size="sm"
												className="h-7 gap-1 px-2 text-xs"
												onClick={() => onEdit(persona)}
											>
												<Pencil className="size-3.5" />
												{t("persona.edit")}
											</Button>
										) : null}
										{onDelete ? (
											<MagicTooltip title={t("persona.delete")}>
												<Button
													variant="ghost"
													size="icon"
													className="size-7 text-muted-foreground hover:text-destructive"
													aria-label={t("persona.delete")}
													onClick={() => onDelete(persona)}
												>
													<Trash2 className="size-3.5" />
												</Button>
											</MagicTooltip>
										) : null}
									</div>
								) : null}
							</div>
							{leadQuote ? (
								<p className="relative ml-2 text-[15px] font-bold leading-relaxed text-foreground before:absolute before:right-full before:content-['“'] after:content-['”']">
									{leadQuote}
								</p>
							) : null}
							<div className="flex flex-wrap gap-1">
								{(persona.tags ?? []).map((tag) => (
									<span
										key={tag}
										className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
									>
										{tag}
									</span>
								))}
							</div>
							<div className="grid grid-cols-3 gap-2 text-center">
								<Stat label={t("persona.stat.tier")} value={tierCopy.label} />
								<Stat
									label={t("persona.stat.sources")}
									value={isManual ? "—" : String(persona.evidence?.length ?? 0)}
								/>
								<Stat
									label={t("persona.stat.rounds")}
									value={interview ? String(answeredRounds) : "—"}
								/>
							</div>
							<p className="text-xs leading-5 text-muted-foreground">
								{tierCopy.hint}
							</p>
							{persona.edited_at && !isManual ? (
								<p className="rounded-lg bg-muted/60 px-2.5 py-1.5 text-xs leading-5 text-muted-foreground">
									{t("persona.editedNotice", {
										date: dayjs(persona.edited_at).format("MM-DD"),
									})}
								</p>
							) : null}
							<AiSimulatedNote />
						</SheetHeader>
						{/* Radix wraps content in a table that grows with long values; keep it to the sheet width. */}
						<ScrollArea className="min-h-0 flex-1 [&_[data-radix-scroll-area-viewport]>div]:!block">
							<div className="flex flex-col gap-6 p-5 text-sm">
								{interview?.quotes?.[0] ? (
									<blockquote className="flex gap-2 rounded-xl bg-primary/5 p-3 text-sm leading-6">
										<Quote className="mt-1 size-4 shrink-0 text-primary" />
										<span>{interview.quotes[0].text}</span>
									</blockquote>
								) : null}
								<Section
									icon={<FingerprintPattern className="size-4" />}
									title={t("persona.section.dimensions")}
								>
									<Field
										label={t("persona.dimension.demographics")}
										value={dimensions?.demographics}
										source={fieldSourceOf("demographics")}
									/>
									<Field
										label={t("persona.dimension.geography")}
										value={dimensions?.geography}
										source={fieldSourceOf("geography")}
									/>
									<Field
										label={t("persona.dimension.psychographics")}
										value={dimensions?.psychographics}
										source={fieldSourceOf("psychographics")}
									/>
									<Field
										label={t("persona.dimension.behavior")}
										value={dimensions?.behavior}
										source={fieldSourceOf("behavior")}
									/>
									<Field
										label={t("persona.dimension.needsPains")}
										value={dimensions?.needs_pains}
										source={fieldSourceOf("needs_pains")}
									/>
									<Field
										label={t("persona.dimension.techAdoption")}
										value={dimensions?.tech_adoption}
										source={fieldSourceOf("tech_adoption")}
									/>
									<Field
										label={t("persona.dimension.social")}
										value={dimensions?.social}
										source={fieldSourceOf("social")}
									/>
								</Section>
								<Section
									icon={<Layers className="size-4" />}
									title={t("persona.section.layers")}
								>
									<Field
										label={t("persona.layer.expression")}
										value={layers?.expression}
									/>
									<Field label={t("persona.layer.story")} value={layers?.story} />
									<DecisionWeights value={layers?.cognition?.decision_weights} />
									<Field
										label={t("persona.layer.behavior")}
										value={layers?.behavior}
									/>
								</Section>
								{persona.consistency_notes?.length ? (
									<Section
										icon={<Split className="size-4" />}
										title={t("persona.section.contradictions")}
									>
										<ul className="flex flex-col gap-1.5">
											{persona.consistency_notes.map((note, index) => (
												<li
													key={index}
													className="rounded-lg bg-muted/60 px-2.5 py-1.5 text-xs leading-5"
												>
													{note}
												</li>
											))}
										</ul>
										<p className="text-[11px] text-muted-foreground">
											{t("persona.contradictionsHint")}
										</p>
									</Section>
								) : null}
								{isManual && !persona.evidence?.length ? null : (
									<Section
										icon={<Brain className="size-4" />}
										title={t("persona.section.evidence")}
									>
										{persona.evidence?.length ? (
											<ul className="flex flex-col gap-2">
												{persona.evidence.map((item) => (
													<EvidenceItem key={item.id} item={item} />
												))}
											</ul>
										) : (
											<p className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-xs leading-5 text-amber-700 dark:text-amber-400">
												<ShieldAlert className="mt-0.5 size-4 shrink-0" />
												{t("persona.noEvidence")}
											</p>
										)}
									</Section>
								)}
							</div>
						</ScrollArea>
						{onAskPersona || (interview && onOpenInterview) ? (
							<div className="flex gap-2 border-t border-border p-4">
								{onAskPersona ? (
									<Button
										className="flex-1"
										onClick={() => onAskPersona(persona)}
									>
										<MessageCircleQuestion className="size-4" />
										{t("persona.ask")}
									</Button>
								) : null}
								{interview && onOpenInterview ? (
									<Button
										variant="outline"
										className="flex-1"
										onClick={() => onOpenInterview(persona.id)}
									>
										<MessagesSquare className="size-4" />
										{t("persona.viewInterview")}
									</Button>
								) : null}
							</div>
						) : null}
					</>
				) : null}
			</SheetContent>
		</Sheet>
	)
}

function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-lg bg-muted/60 px-2 py-1.5">
			<div className="truncate text-sm font-semibold text-foreground">{value}</div>
			<div className="text-[11px] text-muted-foreground">{label}</div>
		</div>
	)
}

function Section({
	icon,
	title,
	children,
}: {
	icon: ReactNode
	title: string
	children: ReactNode
}) {
	return (
		<section className="flex flex-col gap-2.5">
			<h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
				{icon}
				{title}
			</h3>
			<div className="flex flex-col gap-2">{children}</div>
		</section>
	)
}

function Field({
	label,
	value,
	source,
}: {
	label: string
	value: unknown
	/** Evidence ids, "inferred" or "user"; absent on older persona files and manual personas. */
	source?: PersonaFieldSource
}) {
	const { t, i18n } = useTranslation("personaResearch")
	// Contract keys and values (age, city_tier, male) get names; anything else shows as written.
	const labelOf = (text: string) =>
		i18n.exists(`personaResearch:persona.field.${text}`)
			? t(`persona.field.${text}`)
			: text.replaceAll("_", " ")
	const format = (item: unknown) =>
		formatResearchValue(item, {
			labelOf,
			keySeparator: i18n.language.toLowerCase().startsWith("zh") ? "：" : ": ",
		})
	// Objects become a small key/value grid and lists one item per line; text stays as written.
	const entries =
		value && typeof value === "object" && !Array.isArray(value)
			? Object.entries(value as Record<string, unknown>)
					.map(([key, item]) => ({ key, label: labelOf(key), text: format(item) }))
					.filter((entry) => entry.text)
			: null
	const items = Array.isArray(value) ? value.map(format).filter(Boolean) : null
	const text = entries || items ? "" : format(value)
	if (!entries?.length && !items?.length && !text) return null
	return (
		<div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2">
			<span className="flex flex-col gap-1 text-xs leading-5 text-muted-foreground">
				{label}
				{source ? (
					<span
						className={cn(
							"w-fit rounded px-1 text-[10px] leading-4",
							source === "inferred"
								? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
								: source === "user"
									? "bg-slate-500/15 text-slate-700 dark:text-slate-300"
									: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
						)}
					>
						{source === "inferred"
							? t("persona.fieldInferred")
							: source === "user"
								? t("persona.fieldUser")
								: t("persona.fieldSourced", { ids: source.join("、") })}
					</span>
				) : null}
			</span>
			{entries?.length ? (
				<dl className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-x-4 gap-y-2.5">
					{entries.map((entry) => (
						<div key={entry.key} className="flex min-w-0 flex-col gap-0.5">
							<dt className="text-[11px] leading-4 text-muted-foreground">
								{entry.label}
							</dt>
							<dd className="break-words leading-5 text-foreground">{entry.text}</dd>
						</div>
					))}
				</dl>
			) : items?.length ? (
				<ul className="flex min-w-0 flex-col gap-1.5">
					{items.map((item, index) => (
						<li key={index} className="flex gap-2 leading-5 text-foreground">
							<span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/60" />
							<span className="min-w-0 break-words">{item}</span>
						</li>
					))}
				</ul>
			) : (
				<span className="min-w-0 whitespace-pre-wrap break-words leading-5 text-foreground">
					{text}
				</span>
			)}
		</div>
	)
}

/** Source card: type icon, title, domain for web sources and the quoted snippet. */
function EvidenceItem({ item }: { item: PersonaEvidence }) {
	const { t } = useTranslation("personaResearch")
	const Icon =
		item.type === "web"
			? Globe
			: item.type === "social"
				? Smartphone
				: item.type === "upload"
					? FileText
					: MessagesSquare
	let domain = ""
	if (item.url) {
		try {
			domain = new URL(item.url).hostname.replace(/^www\./, "")
		} catch {
			domain = ""
		}
	}
	return (
		<li className="rounded-lg border border-border p-2.5">
			<div className="flex items-center gap-2 text-xs">
				<Icon className="size-3.5 shrink-0 text-muted-foreground" />
				<span className="min-w-0 flex-1 truncate font-medium text-foreground">
					{item.platform ? `${item.platform} · ` : ""}
					{item.title || item.file || domain || item.url}
				</span>
				{item.url ? (
					<a
						href={item.url}
						target="_blank"
						rel="noreferrer noopener"
						className="flex shrink-0 items-center gap-1 rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						aria-label={t("persona.openSource")}
					>
						{domain}
						<ExternalLink className="size-3" />
					</a>
				) : null}
			</div>
			{item.quote ? (
				<p className="mt-1.5 border-l-2 border-border pl-2 text-xs leading-5 text-muted-foreground">
					{item.quote}
				</p>
			) : null}
		</li>
	)
}

/** Decision factors as high / medium / low chips; legacy numeric weights are ranked, never shown. */
function DecisionWeights({ value }: { value: unknown }) {
	const { t } = useTranslation("personaResearch")
	const weights = normalizeDecisionWeights(value)
	if (weights.length === 0) return null
	const levelLabel = { high: t("level.high"), medium: t("level.medium"), low: t("level.low") }
	return (
		<div className="grid grid-cols-[88px_minmax(0,1fr)] gap-2">
			<span className="text-xs leading-5 text-muted-foreground">
				{t("persona.layer.cognition")}
			</span>
			<span className="flex flex-wrap gap-1.5">
				{weights.map((weight) => (
					<span
						key={weight.factor}
						className={cn(
							"inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs",
							weight.level === "high"
								? "border-primary/40 bg-primary/10 text-primary"
								: "border-border text-foreground",
						)}
					>
						{weight.factor}
						<span className="text-[10px] opacity-70">{levelLabel[weight.level]}</span>
					</span>
				))}
			</span>
		</div>
	)
}
