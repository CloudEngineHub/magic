import { useRef, useState, type KeyboardEvent } from "react"
import { useMemoizedFn } from "ahooks"
import { observer } from "mobx-react-lite"
import { X } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/shadcn-ui/sheet"
import { useIsMobile } from "@/hooks/useIsMobile"
import TopicFilesButton from "@/pages/superMagic/components/TopicFilesButton"
import PreviewDetailPopup, {
	type PreviewDetail,
	type PreviewDetailPopupRef,
} from "@/pages/superMagicMobile/components/PreviewDetailPopup"
import { resolveRuntimeFileOpen } from "@/pages/share/microApp/hooks/resolveRuntimeFileOpen"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import type { PersonaFile } from "../types"
import { usePersonaResearchStore } from "../context"
import { getAttachmentPath, normalizeResearchPath } from "../services/researchFiles"
import { routeResearchFile } from "../services/researchFileRouting"
import PersonaDetailSheet from "./PersonaDetailSheet"
import ResearchStateView from "./ResearchStateView"

interface ResearchHistoryFilesProps {
	open: boolean
	onOpenChange: (open: boolean) => void
}

/**
 * "历史产物": every file of the research project (personas, studies/<slug>/ reports, plans,
 * interviews, templates) in a right-hand sidebar, with a floating preview for the clicked file.
 * Desktop docks the sidebar beside the page; phones use a full-width drawer.
 *
 * Reuses the project file tree (TopicFilesButton: rename, delete, download, upload...) and the
 * shared file preview popup (the same renderers as the study's files tab). The tree reads the
 * research store's own files store and attachment index, so it lists the whole project even
 * when no study is selected; nothing here walks or copies the attachments.
 */
function ResearchHistoryFiles({ open, onOpenChange }: ResearchHistoryFilesProps) {
	const { t } = useTranslation("personaResearch")
	const isMobile = useIsMobile()
	const store = usePersonaResearchStore()
	const previewRef = useRef<PreviewDetailPopupRef>(null)
	// Contract files that have their own dialog (a library persona) open it instead of raw JSON.
	const [openedPersona, setOpenedPersona] = useState<PersonaFile | null>(null)

	const openPreview = useMemoizedFn((detail: PreviewDetail) => {
		// Both arguments are the store's own arrays, handed over by reference.
		previewRef.current?.open(detail, store.attachments, store.attachmentList)
	})

	/** Every file click and tool detail from the tree ends here. */
	const openFile = useMemoizedFn((file?: unknown) => {
		const result = resolveRuntimeFileOpen(file)
		if (result.kind !== "preview") return
		const item = file as AttachmentItem
		const route = routeResearchFile(
			getAttachmentPath(item) || normalizeResearchPath(item.file_path),
		)
		if (route.kind === "persona") {
			const persona = store.personaById(route.personaId)
			if (persona) {
				setOpenedPersona(persona)
				return
			}
		}
		openPreview(result.detail)
	})

	const project = store.selectedProject
	const content = project ? (
		<TopicFilesButton
			// The tree needs the research project's own files store, not the global workspace's.
			projectFilesStore={store.projectFilesStore}
			attachments={store.attachments}
			projectId={project.id}
			selectedProject={project}
			selectedTopic={store.selectedTopic}
			setUserSelectDetail={openFile}
			onFileClick={openFile}
			allowEdit={!store.isReadOnly}
			allowDownload
			showTitle={false}
			showRefresh={false}
		/>
	) : (
		<ResearchStateView status="loading" />
	)

	/** Esc closes the docked sidebar when focus is inside it; the preview popup handles its own Esc. */
	const handleKeyDown = useMemoizedFn((event: KeyboardEvent<HTMLElement>) => {
		if (event.key === "Escape" && !event.defaultPrevented) onOpenChange(false)
	})

	return (
		<>
			{isMobile ? (
				// Radix Sheet traps focus, restores it to the entry button and closes on Esc.
				<Sheet open={open} onOpenChange={onOpenChange}>
					<SheetContent
						side="right"
						showClose={false}
						className="w-full gap-0 p-0 sm:max-w-full"
						data-testid="persona-research-history-files"
					>
						<SheetHeader className="flex-row items-center justify-between gap-2 border-b border-border px-4 py-3">
							<div className="flex min-w-0 flex-col gap-0.5">
								<SheetTitle className="text-sm">
									{t("historyFiles.title")}
								</SheetTitle>
								<SheetDescription className="truncate text-xs">
									{t("historyFiles.description")}
								</SheetDescription>
							</div>
							<CloseButton onClick={() => onOpenChange(false)} />
						</SheetHeader>
						<div className="min-h-0 flex-1">{content}</div>
					</SheetContent>
				</Sheet>
			) : open ? (
				<aside
					aria-label={t("historyFiles.title")}
					data-testid="persona-research-history-files"
					// Docked beside the page; the page's own scroll area keeps its place.
					className="flex h-full w-[360px] shrink-0 flex-col border-l border-border bg-background"
					onKeyDown={handleKeyDown}
				>
					<div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
						<div className="flex min-w-0 flex-col gap-0.5">
							<h2 className="text-sm font-semibold text-foreground">
								{t("historyFiles.title")}
							</h2>
							<p className="truncate text-xs text-muted-foreground">
								{t("historyFiles.description")}
							</p>
						</div>
						<CloseButton onClick={() => onOpenChange(false)} />
					</div>
					<div className="min-h-0 flex-1">{content}</div>
				</aside>
			) : null}
			{/* Outside the sheet so its overlay stacks above the drawer on phones. */}
			<PreviewDetailPopup
				ref={previewRef}
				setUserSelectDetail={(detail) => detail && openPreview(detail)}
				selectedProject={store.selectedProject}
				selectedTopic={store.selectedTopic}
				allowEdit={!store.isReadOnly}
				allowDownload
			/>
			<PersonaDetailSheet
				persona={openedPersona}
				onOpenChange={(next) => {
					if (!next) setOpenedPersona(null)
				}}
				side={isMobile ? "bottom" : "center"}
			/>
		</>
	)
}

function CloseButton({ onClick }: { onClick: () => void }) {
	const { t } = useTranslation("personaResearch")
	return (
		<Button
			type="button"
			variant="ghost"
			size="icon"
			className="size-8 shrink-0 text-muted-foreground"
			aria-label={t("historyFiles.close")}
			onClick={onClick}
		>
			<X className="size-4" />
		</Button>
	)
}

export default observer(ResearchHistoryFiles)
