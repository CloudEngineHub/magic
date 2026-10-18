import { ChevronRight, Ellipsis, Trash2 } from "lucide-react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/shadcn-ui/dropdown-menu"
import MagicTooltip from "@/components/base/MagicTooltip"
import dayjs from "@/infrastructure/vendors/dayjs"
import type { Topic } from "@/pages/superMagic/pages/Workspace/types"
import { Skeleton } from "@/components/shadcn-ui/skeleton"
import { cn } from "@/utils/cn"
import { usePersonaResearchStore } from "../context"
import { resolveStudyStatus } from "../services/studyStatus"
import {
	StudyProgressSegments,
	StudyStatusBadge,
	StudyStatusBadgeSkeleton,
} from "./StudyStatusBadge"

interface StudyListItemProps {
	topic: Topic
	onOpen: (topic: Topic) => void
	onDelete: (topic: Topic) => void
}

/**
 * One study row: title, live status, 6-step progress and relative update time.
 * Studies waiting for the user's answer get a subtle highlight so they are found first.
 */
function StudyListItem({ topic, onOpen, onDelete }: StudyListItemProps) {
	const { t, i18n } = useTranslation("personaResearch")
	// Instance locale, so the row does not inherit another component's global dayjs locale.
	const dayjsLocale = i18n.language.toLowerCase().startsWith("zh") ? "zh-cn" : "en"
	const store = usePersonaResearchStore()
	const study = store.studyFileOf(topic)
	const status = resolveStudyStatus(topic, study)
	const title = store.studyTitleOf(topic) || t("study.untitled")
	const isPersonaBuild = study?.study_type === "persona_build"

	return (
		<li
			className={cn(
				"group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40",
				status.kind === "waiting_user" && "bg-amber-500/[0.06]",
			)}
		>
			<button
				type="button"
				className="flex min-w-0 flex-1 flex-col gap-1.5 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
				onClick={() => onOpen(topic)}
			>
				<span className="flex min-w-0 items-center gap-2">
					<span className="truncate text-sm font-medium text-foreground">{title}</span>
					{store.studyFilesReady ? (
						<StudyStatusBadge status={status} />
					) : (
						<StudyStatusBadgeSkeleton />
					)}
				</span>
				<span className="flex items-center gap-3">
					{store.studyFilesReady ? (
						<>
							{/* Persona building has no research phases; its type replaces the 6-step progress. */}
							{isPersonaBuild ? (
								<span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
									{t("studyType.personaBuild")}
								</span>
							) : (
								<StudyProgressSegments status={status} className="w-28" />
							)}
							<span className="text-xs text-muted-foreground">
								{[
									isPersonaBuild
										? null
										: t("study.progress", {
												done: status.completed,
												total: status.total,
											}),
									topic.updated_at
										? dayjs(topic.updated_at).locale(dayjsLocale).fromNow()
										: null,
								]
									.filter(Boolean)
									.join(" · ")}
							</span>
						</>
					) : (
						<Skeleton className="h-3 w-48" />
					)}
				</span>
			</button>
			<DropdownMenu>
				<MagicTooltip title={t("home.moreActions")}>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="size-8 opacity-60 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
							aria-label={t("home.moreActions")}
						>
							<Ellipsis className="size-4" />
						</Button>
					</DropdownMenuTrigger>
				</MagicTooltip>
				<DropdownMenuContent align="end">
					<DropdownMenuItem className="text-destructive" onSelect={() => onDelete(topic)}>
						<Trash2 className="size-4" />
						{t("home.delete")}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<ChevronRight
				aria-hidden
				className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
			/>
		</li>
	)
}

export default observer(StudyListItem)
