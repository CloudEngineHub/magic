import type { ReactNode } from "react"
import {
	Brain,
	ExternalLink,
	FileText,
	Fingerprint,
	Globe,
	Layers,
	MessageCircleQuestion,
	MessagesSquare,
	Quote,
	ShieldAlert,
} from "lucide-react"
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
import { cn } from "@/utils/cn"
import type { InterviewFile, PersonaEvidence, PersonaFile } from "../types"
import { formatResearchValue } from "./formatValue"
import PersonaAvatar from "./PersonaAvatar"
import { PERSONA_TIER_RING } from "./PersonaCard"

interface PersonaDetailSheetProps {
	persona: PersonaFile | null
	interview?: InterviewFile | null
	onOpenChange: (open: boolean) => void
	/** Prefills the composer with a follow-up question for this persona. */
	onAskPersona?: (persona: PersonaFile) => void
	onOpenInterview?: (personaId: string) => void
	side?: "right" | "bottom"
}

/** Seven dimensions, four evidence layers and sources of one persona. */
export default function PersonaDetailSheet({
	persona,
	interview,
	onOpenChange,
	onAskPersona,
	onOpenInterview,
	side = "right",
}: PersonaDetailSheetProps) {
	const { t } = useTranslation("personaResearch")
	const dimensions = persona?.dimensions
	const layers = persona?.layers
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
			}[persona.tier]
		: null
	const answeredRounds = interview?.rounds.filter((round) => round.role === "persona").length ?? 0

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
						<SheetHeader className="gap-3 border-b border-border p-5">
							<div className="flex items-center gap-3">
								<PersonaAvatar
									id={persona.id}
									name={persona.name}
									className={cn(
										"size-12 text-base ring-2 ring-offset-2 ring-offset-background",
										PERSONA_TIER_RING[persona.tier],
									)}
								/>
								<div className="min-w-0">
									<SheetTitle className="truncate text-base">
										{persona.name}
									</SheetTitle>
									<SheetDescription className="line-clamp-2">
										{persona.tagline}
									</SheetDescription>
								</div>
							</div>
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
									value={String(persona.evidence?.length ?? 0)}
								/>
								<Stat
									label={t("persona.stat.rounds")}
									value={interview ? String(answeredRounds) : "—"}
								/>
							</div>
							<p className="text-xs leading-5 text-muted-foreground">
								{tierCopy.hint}
							</p>
						</SheetHeader>
						<ScrollArea className="min-h-0 flex-1">
							<div className="flex flex-col gap-6 p-5 text-sm">
								{interview?.quotes?.[0] ? (
									<blockquote className="flex gap-2 rounded-xl bg-primary/5 p-3 text-sm leading-6">
										<Quote className="mt-1 size-4 shrink-0 text-primary" />
										<span>{interview.quotes[0].text}</span>
									</blockquote>
								) : null}
								<Section
									icon={<Fingerprint className="size-4" />}
									title={t("persona.section.dimensions")}
								>
									<Field
										label={t("persona.dimension.demographics")}
										value={dimensions?.demographics}
									/>
									<Field
										label={t("persona.dimension.geography")}
										value={dimensions?.geography}
									/>
									<Field
										label={t("persona.dimension.psychographics")}
										value={dimensions?.psychographics}
									/>
									<Field
										label={t("persona.dimension.behavior")}
										value={dimensions?.behavior}
									/>
									<Field
										label={t("persona.dimension.needsPains")}
										value={dimensions?.needs_pains}
									/>
									<Field
										label={t("persona.dimension.techAdoption")}
										value={dimensions?.tech_adoption}
									/>
									<Field
										label={t("persona.dimension.social")}
										value={dimensions?.social}
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
									<Field
										label={t("persona.layer.cognition")}
										value={layers?.cognition?.decision_weights}
									/>
									<Field
										label={t("persona.layer.behavior")}
										value={layers?.behavior}
									/>
								</Section>
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

function Field({ label, value }: { label: string; value: unknown }) {
	const text = formatResearchValue(value)
	if (!text) return null
	return (
		<div className="grid grid-cols-[88px_1fr] gap-2">
			<span className="text-xs leading-5 text-muted-foreground">{label}</span>
			<span className="whitespace-pre-wrap break-words leading-5 text-foreground">
				{text}
			</span>
		</div>
	)
}

/** Source card: type icon, title, domain for web sources and the quoted snippet. */
function EvidenceItem({ item }: { item: PersonaEvidence }) {
	const { t } = useTranslation("personaResearch")
	const Icon = item.type === "web" ? Globe : item.type === "upload" ? FileText : MessagesSquare
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
