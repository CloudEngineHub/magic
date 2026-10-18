import type { ReactNode } from "react"
import {
	ChartColumn,
	ChevronRight,
	ClipboardCheck,
	Download,
	FileText,
	Mic,
	MessagesSquare,
	UsersRound,
	type LucideIcon,
} from "lucide-react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import MagicTooltip from "@/components/base/MagicTooltip"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import { useFileAccess } from "@/pages/superMagic/providers/FileAccessProvider"
import { cn } from "@/utils/cn"
import { usePersonaResearchStore } from "../context"
import { useResearchFileDownload } from "../hooks/useResearchFileDownload"
import type { StudyDeliverables } from "../services/researchDeliverables"
import type { ResearchConsoleTab } from "./ResearchConsole"

const INVALID_FILE_NAME = /[\\/:*?"<>|\r\n]+/g

interface ResearchDeliverablesProps {
	deliverables: StudyDeliverables
	className?: string
	/** Opens a file in the files tab preview. */
	onOpenFile?: (file: AttachmentItem) => void
	/** Switches the outputs panel to a tab, e.g. validation or interviews. */
	onShowOutputs?: (tab: ResearchConsoleTab) => void
}

/**
 * Replaces the generic attachment list under a research message: files are named by their role
 * in the study, the report leads, and structured data opens the output tab that renders it.
 */
function ResearchDeliverables({
	deliverables,
	className,
	onOpenFile,
	onShowOutputs,
}: ResearchDeliverablesProps) {
	const { t } = useTranslation("personaResearch")
	const store = usePersonaResearchStore()
	const { permissions } = useFileAccess()
	const downloadFile = useResearchFileDownload()
	const canOpen = permissions.view && permissions.preview
	const { report, validation, validationCsv, documents, others } = deliverables

	const hypotheses = store.study?.hypotheses ?? []
	const decided = hypotheses.filter((item) => item.verdict !== "pending").length
	const studyTitle = store.selectedTopic ? store.studyTitleOf(store.selectedTopic) : ""
	/** Saves a deliverable as "<study title>[-<label>].<ext>"; undefined keeps the stored name. */
	const downloadName = (file: AttachmentItem, label?: string) => {
		const base = [studyTitle, label].filter(Boolean).join("-").replace(INVALID_FILE_NAME, " ")
		if (!base.trim()) return undefined
		const ext = file.file_extension || file.file_name?.split(".").pop()
		return ext ? `${base.trim()}.${ext}` : base.trim()
	}
	const documentLabels = {
		plan: t("console.docPlan"),
		deskResearch: t("console.docDeskResearch"),
	}

	/** Structured files have no readable preview; each chip opens the tab that renders them. */
	const summaryChips: {
		key: string
		icon: LucideIcon
		label: string
		tab: ResearchConsoleTab
	}[] = []
	if (deliverables.hasPanel)
		summaryChips.push({
			key: "panel",
			icon: UsersRound,
			label: t("deliverables.panel"),
			tab: "personas",
		})
	if (deliverables.interviews > 0)
		summaryChips.push({
			key: "interviews",
			icon: Mic,
			label: t("deliverables.interviews", { count: deliverables.interviews }),
			tab: "interviews",
		})
	if (deliverables.discussions > 0)
		summaryChips.push({
			key: "discussions",
			icon: MessagesSquare,
			label: t("deliverables.discussions", { count: deliverables.discussions }),
			tab: "discussions",
		})
	if (deliverables.hasSynthesis)
		summaryChips.push({
			key: "analysis",
			icon: ChartColumn,
			label: t("deliverables.analysis"),
			tab: "analysis",
		})
	if (deliverables.hasValidationResults)
		summaryChips.push({
			key: "validation",
			icon: ClipboardCheck,
			label: t("deliverables.validationResults"),
			tab: "validation",
		})

	const questionnaire = validation ?? validationCsv

	return (
		<div
			className={cn("flex w-full flex-col gap-2", className)}
			data-testid="persona-research-deliverables"
		>
			<div className="text-sm font-medium text-foreground">{t("deliverables.title")}</div>

			{report ? (
				<div className="flex items-center gap-3 rounded-xl border border-border bg-background p-3">
					<span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
						<FileText className="size-4" />
					</span>
					<div className="flex min-w-0 flex-1 flex-col gap-0.5">
						<span className="truncate text-sm font-medium text-foreground">
							{t("console.docReport")}
						</span>
						<span className="truncate text-xs text-muted-foreground">
							{hypotheses.length
								? t("deliverables.reportSummary", {
										decided,
										total: hypotheses.length,
									})
								: report.file_name}
						</span>
					</div>
					{permissions.download ? (
						<DownloadButton
							label={t("deliverables.download")}
							onClick={() => downloadFile(report.file_id, downloadName(report))}
						/>
					) : null}
					{canOpen ? (
						<Button size="sm" className="shrink-0" onClick={() => onOpenFile?.(report)}>
							{t("deliverables.openReport")}
						</Button>
					) : null}
				</div>
			) : null}

			{questionnaire ? (
				<DeliverableRow
					title={t("console.docValidation")}
					meta={
						validation && validationCsv
							? t("deliverables.questionnaireFormats")
							: questionnaire.file_name
					}
					onOpen={canOpen ? () => onShowOutputs?.("validation") : undefined}
					action={
						permissions.download ? (
							<DownloadButton
								label={
									validationCsv
										? t("deliverables.downloadCsv")
										: t("deliverables.download")
								}
								onClick={() => {
									const file = validationCsv ?? questionnaire
									downloadFile(
										file.file_id,
										downloadName(file, t("console.docValidation")),
									)
								}}
							/>
						) : null
					}
				/>
			) : null}

			{[
				...documents.map(({ key, file }) => ({ title: documentLabels[key], file })),
				...others.map((file) => ({ title: file.file_name ?? "", file })),
			].map(({ title, file }) => (
				<DeliverableRow
					key={String(file.file_id ?? file.relative_file_path)}
					title={title}
					meta={title === file.file_name ? undefined : file.file_name}
					onOpen={canOpen ? () => onOpenFile?.(file) : undefined}
					action={
						permissions.download ? (
							<DownloadButton
								label={t("deliverables.download")}
								onClick={() =>
									downloadFile(file.file_id, downloadName(file, title))
								}
							/>
						) : null
					}
				/>
			))}

			{summaryChips.length ? (
				<div className="flex flex-wrap gap-1.5">
					{summaryChips.map(({ key, icon: Icon, label, tab }) => (
						<Button
							key={key}
							variant="outline"
							size="sm"
							className="h-7 gap-1.5 rounded-full px-2.5 text-xs font-normal"
							onClick={() => onShowOutputs?.(tab)}
						>
							<Icon className="size-4 text-muted-foreground" />
							{label}
						</Button>
					))}
				</div>
			) : null}
		</div>
	)
}

interface DeliverableRowProps {
	title: string
	meta?: string
	onOpen?: () => void
	action?: ReactNode
}

/** A secondary deliverable: the whole row opens it; download stays a separate button. */
function DeliverableRow({ title, meta, onOpen, action }: DeliverableRowProps) {
	return (
		<div className="flex items-center gap-1 rounded-xl bg-fill pr-1.5 transition-colors hover:bg-fill-secondary">
			<button
				type="button"
				className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
				onClick={onOpen}
				disabled={!onOpen}
			>
				<span className="truncate text-sm text-foreground">{title}</span>
				{meta ? (
					<span className="truncate text-xs text-muted-foreground">{meta}</span>
				) : null}
				{onOpen ? (
					<ChevronRight className="ml-auto size-4 shrink-0 text-muted-foreground" />
				) : null}
			</button>
			{action}
		</div>
	)
}

function DownloadButton({ label, onClick }: { label: string; onClick: () => void }) {
	return (
		<MagicTooltip title={label}>
			<Button
				variant="ghost"
				size="icon"
				className="size-8 shrink-0 text-muted-foreground"
				aria-label={label}
				onClick={onClick}
			>
				<Download className="size-4" />
			</Button>
		</MagicTooltip>
	)
}

export default observer(ResearchDeliverables)
