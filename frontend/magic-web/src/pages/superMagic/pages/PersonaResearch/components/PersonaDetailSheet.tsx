import type { ReactNode } from "react"
import { ExternalLink, MessageCircleQuestion } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Badge } from "@/components/shadcn-ui/badge"
import { Button } from "@/components/shadcn-ui/button"
import { ScrollArea } from "@/components/shadcn-ui/scroll-area"
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/shadcn-ui/sheet"
import type { InterviewFile, PersonaFile } from "../types"
import { formatResearchValue } from "./formatValue"
import PersonaAvatar from "./PersonaAvatar"

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

	return (
		<Sheet open={Boolean(persona)} onOpenChange={onOpenChange}>
			<SheetContent
				side={side}
				className={
					side === "right"
						? "flex w-full flex-col p-0 sm:max-w-md"
						: "flex max-h-[85vh] flex-col p-0"
				}
			>
				{persona ? (
					<>
						<SheetHeader className="border-b border-border p-4">
							<div className="flex items-center gap-3">
								<PersonaAvatar
									id={persona.id}
									name={persona.name}
									className="size-11"
								/>
								<div className="min-w-0">
									<SheetTitle className="truncate">{persona.name}</SheetTitle>
									<SheetDescription className="line-clamp-2">
										{persona.tagline}
									</SheetDescription>
								</div>
							</div>
							<div className="flex flex-wrap gap-1 pt-2">
								{(persona.tags ?? []).map((tag) => (
									<Badge key={tag} variant="secondary" className="font-normal">
										{tag}
									</Badge>
								))}
							</div>
						</SheetHeader>
						<ScrollArea className="min-h-0 flex-1">
							<div className="flex flex-col gap-5 p-4 text-sm">
								<Section title={t("persona.section.dimensions")}>
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
								<Section title={t("persona.section.layers")}>
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
								{persona.evidence && persona.evidence.length > 0 ? (
									<Section title={t("persona.section.evidence")}>
										<ul className="flex flex-col gap-2">
											{persona.evidence.map((item) => (
												<li
													key={item.id}
													className="rounded-md bg-muted/50 p-2"
												>
													<div className="flex items-center gap-1 text-xs font-medium">
														<span className="truncate">
															{item.title || item.file || item.url}
														</span>
														{item.url ? (
															<a
																href={item.url}
																target="_blank"
																rel="noreferrer noopener"
																className="text-muted-foreground hover:text-foreground"
																aria-label={t("persona.openSource")}
															>
																<ExternalLink className="size-3.5" />
															</a>
														) : null}
													</div>
													{item.quote ? (
														<p className="mt-1 text-xs text-muted-foreground">
															“{item.quote}”
														</p>
													) : null}
												</li>
											))}
										</ul>
									</Section>
								) : (
									<p className="text-xs text-muted-foreground">
										{t("persona.noEvidence")}
									</p>
								)}
							</div>
						</ScrollArea>
						<div className="flex gap-2 border-t border-border p-3">
							{onAskPersona ? (
								<Button className="flex-1" onClick={() => onAskPersona(persona)}>
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
									{t("persona.viewInterview")}
								</Button>
							) : null}
						</div>
					</>
				) : null}
			</SheetContent>
		</Sheet>
	)
}

function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="flex flex-col gap-2">
			<h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
			{children}
		</section>
	)
}

function Field({ label, value }: { label: string; value: unknown }) {
	const text = formatResearchValue(value)
	if (!text) return null
	return (
		<div className="grid grid-cols-[88px_1fr] gap-2">
			<span className="text-xs text-muted-foreground">{label}</span>
			<span className="whitespace-pre-wrap break-words text-foreground">{text}</span>
		</div>
	)
}
