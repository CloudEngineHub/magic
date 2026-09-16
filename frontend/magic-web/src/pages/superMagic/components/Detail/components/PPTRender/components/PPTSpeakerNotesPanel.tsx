import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Loader2, NotebookPen, Sparkles } from "lucide-react"
import { Button } from "@/components/shadcn-ui/button"
import { cn } from "@/utils/cn"
import { shadow } from "@/utils/shadow"
import { extractSlideNotes, upsertSlideNotes } from "../utils/slideNotes"
import { useSpeakerNotesResize } from "../hooks/useSpeakerNotesResize"

interface PPTSpeakerNotesPanelProps {
	visible?: boolean
	slideIndex: number
	rawContent: string
	fileId: string
	getLatestRawContent?: () => string
	allowEdit: boolean
	saveEditContent?: (
		content: any,
		fileId?: string,
		enable_shadow?: boolean,
		fetchFileVersions?: (fileId: string) => void,
		isPPTEditMode?: boolean,
	) => Promise<boolean | void>
	onSaved: (content: string, slideIndex: number) => Promise<void>
	onGenerate?: () => void
}

type SaveState = "idle" | "saving" | "saved" | "error"
const MAX_NOTE_SAVE_REBASES = 3

/**
 * Notes deliberately own their edit state instead of reusing PPT HTML edit mode.
 * This lets a user prepare speaker notes while the slide remains a normal preview.
 */
export default function PPTSpeakerNotesPanel(props: PPTSpeakerNotesPanelProps) {
	const drafts = useRef(new Map<string, string>())
	const resize = useSpeakerNotesResize()
	const slideKey = props.fileId || String(props.slideIndex)
	// Isolate edit/save state by slide, retaining only unsaved text when switching pages.
	return (
		<SpeakerNotesEditor
			key={slideKey}
			{...props}
			resize={resize}
			initialDraft={drafts.current.get(slideKey)}
			onDraftChange={(draft) => drafts.current.set(slideKey, draft)}
			onDraftSaved={(draft) => {
				if (drafts.current.get(slideKey) === draft) drafts.current.delete(slideKey)
			}}
		/>
	)
}

function SpeakerNotesEditor({
	visible = true,
	slideIndex,
	rawContent,
	fileId,
	getLatestRawContent,
	allowEdit,
	saveEditContent,
	onSaved,
	onGenerate,
	initialDraft,
	onDraftChange,
	onDraftSaved,
	resize: { panelRef, height, resizeHandleProps },
}: PPTSpeakerNotesPanelProps & {
	initialDraft?: string
	onDraftChange: (draft: string) => void
	onDraftSaved: (draft: string) => void
	resize: ReturnType<typeof useSpeakerNotesResize>
}) {
	const { t } = useTranslation("super")
	const textareaRef = useRef<HTMLTextAreaElement>(null)
	const savingRef = useRef(false)
	const lastSyncedRawContentRef = useRef(rawContent)
	const [notes, setNotes] = useState(() => extractSlideNotes(rawContent))
	const [draft, setDraft] = useState(initialDraft ?? notes)
	const [isEditing, setIsEditing] = useState(initialDraft !== undefined && initialDraft !== notes)
	const [saveState, setSaveState] = useState<SaveState>("idle")
	const dirty = draft !== notes

	useEffect(() => {
		if (isEditing && dirty) return
		const nextNotes = extractSlideNotes(rawContent)
		// The parent may update the slide content asynchronously after save. Do not
		// let the still-stale prop overwrite the locally saved notes in that window.
		if (rawContent === lastSyncedRawContentRef.current && nextNotes !== notes) return
		lastSyncedRawContentRef.current = rawContent
		setNotes(nextNotes)
		setDraft(nextNotes)
		setSaveState("idle")
	}, [dirty, isEditing, notes, rawContent])

	useEffect(() => {
		if (isEditing && visible) textareaRef.current?.focus()
	}, [isEditing, visible])

	const saveNotes = async () => {
		if (!dirty) {
			setIsEditing(false)
			return true
		}
		if (!allowEdit || !saveEditContent || !fileId) return false
		if (savingRef.current) return false

		savingRef.current = true
		setSaveState("saving")
		try {
			let latestRawContent = getLatestRawContent?.() || rawContent
			let nextContent = upsertSlideNotes(latestRawContent, draft)
			for (let attempt = 0; attempt <= MAX_NOTE_SAVE_REBASES; attempt += 1) {
				const result = await saveEditContent(
					shadow(nextContent),
					fileId,
					true,
					undefined,
					true,
				)
				if (result === false) throw new Error("Failed to save speaker notes")

				const currentRawContent = getLatestRawContent?.() || latestRawContent
				if (currentRawContent === latestRawContent || currentRawContent === nextContent)
					break
				if (attempt === MAX_NOTE_SAVE_REBASES) {
					throw new Error("Slide changed repeatedly while saving speaker notes")
				}
				latestRawContent = currentRawContent
				nextContent = upsertSlideNotes(latestRawContent, draft)
			}

			await onSaved(nextContent, slideIndex)
			onDraftSaved(draft)
			setNotes(draft)
			setIsEditing(false)
			setSaveState("saved")
			return true
		} catch (error) {
			console.error("Failed to save speaker notes:", error)
			setSaveState("error")
			return false
		} finally {
			savingRef.current = false
		}
	}

	const statusLabel =
		saveState === "saving"
			? t("ppt.speakerNotes.saving")
			: saveState === "saved"
				? t("ppt.speakerNotes.saved")
				: saveState === "error"
					? t("ppt.speakerNotes.saveFailed")
					: null

	return (
		<section
			ref={panelRef}
			data-testid="ppt-speaker-notes-panel"
			hidden={!visible}
			style={{ height }}
			// Keep the editor mounted while collapsed so unsaved or failed drafts survive.
			className={cn(
				"max-h-[40%] min-h-0 shrink-0 flex-col overflow-hidden border-t border-border/60 bg-background",
				visible ? "flex" : "hidden",
			)}
		>
			<button
				type="button"
				aria-label={t("ppt.speakerNotes.resize")}
				className="group flex h-2 w-full shrink-0 cursor-ns-resize touch-none items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
				{...resizeHandleProps}
			>
				<span className="h-0.5 w-7 rounded-full bg-border transition-colors group-hover:bg-muted-foreground/50" />
			</button>
			<div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-4 pb-2">
				<div className="flex min-w-0 items-center gap-2">
					<NotebookPen className="size-4 shrink-0 text-muted-foreground" />
					<h2 className="truncate text-xs font-normal text-muted-foreground">
						{t("ppt.speakerNotes.pageTitle", { page: slideIndex + 1 })}
					</h2>
					{statusLabel && (
						<span
							role="status"
							className={cn(
								"text-xs",
								saveState === "error"
									? "text-destructive"
									: "text-muted-foreground",
							)}
						>
							{statusLabel}
						</span>
					)}
				</div>
				<div className="flex shrink-0 items-center gap-2">
					{onGenerate && (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={onGenerate}
							className="h-6 gap-1.5 rounded-md px-2 text-xs font-normal text-muted-foreground hover:text-foreground"
						>
							<Sparkles className="size-4" />
							{t("ppt.speakerNotes.generate")}
						</Button>
					)}
					{isEditing && dirty && (
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={saveState === "saving"}
							onClick={() => void saveNotes()}
							className="h-7 px-2 text-xs"
						>
							{saveState === "saving" && (
								<Loader2 className="mr-1.5 size-3.5 animate-spin" />
							)}
							{t("ppt.speakerNotes.save")}
						</Button>
					)}
				</div>
			</div>

			{isEditing ? (
				<textarea
					ref={textareaRef}
					data-testid="ppt-speaker-notes-editor"
					value={draft}
					aria-label={t("ppt.speakerNotes.title")}
					readOnly={saveState === "saving" || !allowEdit}
					onChange={(event) => {
						setDraft(event.target.value)
						onDraftChange(event.target.value)
						setSaveState("idle")
					}}
					onBlur={() => void saveNotes()}
					placeholder={t("ppt.speakerNotes.placeholder")}
					className="mx-3 mb-3 min-h-0 flex-1 resize-none rounded-lg border-0 bg-muted/40 px-3 py-2 text-[13px] leading-6 text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
				/>
			) : (
				<button
					data-testid="ppt-speaker-notes-content"
					type="button"
					disabled={!allowEdit}
					onClick={() => allowEdit && setIsEditing(true)}
					className={cn(
						"mx-3 mb-3 flex min-h-0 flex-1 items-start overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-muted/40 px-3 py-2 text-left text-[13px] leading-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring",
						notes ? "text-foreground" : "text-muted-foreground",
						!allowEdit && "cursor-default",
					)}
				>
					<span className="min-w-0">{notes || t("ppt.speakerNotes.empty")}</span>
				</button>
			)}
		</section>
	)
}
