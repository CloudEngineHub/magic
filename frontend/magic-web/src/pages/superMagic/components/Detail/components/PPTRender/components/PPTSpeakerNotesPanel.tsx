import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Loader2, Pencil, Sparkles } from "lucide-react"
import { Button } from "@/components/shadcn-ui/button"
import { cn } from "@/utils/cn"
import { shadow } from "@/utils/shadow"
import { extractSlideNotes, upsertSlideNotes } from "../utils/slideNotes"

interface PPTSpeakerNotesPanelProps {
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
export default function PPTSpeakerNotesPanel({
	slideIndex,
	rawContent,
	fileId,
	getLatestRawContent,
	allowEdit,
	saveEditContent,
	onSaved,
	onGenerate,
}: PPTSpeakerNotesPanelProps) {
	const { t } = useTranslation("super")
	const textareaRef = useRef<HTMLTextAreaElement>(null)
	const savingRef = useRef(false)
	const lastSyncedRawContentRef = useRef(rawContent)
	const [notes, setNotes] = useState(() => extractSlideNotes(rawContent))
	const [draft, setDraft] = useState(notes)
	const [isEditing, setIsEditing] = useState(false)
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
		if (isEditing) textareaRef.current?.focus()
	}, [isEditing])

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
			data-testid="ppt-speaker-notes-panel"
			className="flex max-h-56 shrink-0 flex-col overflow-y-auto border-t border-border/60 bg-background px-4 py-3"
		>
			<div className="flex items-center justify-between gap-3">
				<div className="flex min-w-0 items-center gap-2">
					<Pencil className="size-4 shrink-0 text-muted-foreground" />
					<h2 className="truncate text-sm font-medium text-foreground">
						{t("ppt.speakerNotes.title")}
					</h2>
					{statusLabel && (
						<span
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
							className="h-7 gap-1.5 px-2 text-xs"
						>
							<Sparkles className="size-3.5" />
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
					onChange={(event) => {
						setDraft(event.target.value)
						setSaveState("idle")
					}}
					onBlur={() => void saveNotes()}
					placeholder={t("ppt.speakerNotes.placeholder")}
					className="mt-2 min-h-24 resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-6 outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
				/>
			) : (
				<button
					type="button"
					disabled={!allowEdit}
					onClick={() => allowEdit && setIsEditing(true)}
					className={cn(
						"mt-2 min-h-16 w-full rounded-md border border-dashed border-border/70 px-3 py-2 text-left text-sm leading-6 transition-colors",
						allowEdit
							? "text-muted-foreground hover:border-primary/50 hover:bg-muted/40"
							: "cursor-default text-muted-foreground/80",
					)}
				>
					{notes || t("ppt.speakerNotes.empty")}
				</button>
			)}
		</section>
	)
}
