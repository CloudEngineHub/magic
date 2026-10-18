import { useEffect, useState, type KeyboardEvent } from "react"
import { useMemoizedFn } from "ahooks"
import { PencilLine } from "lucide-react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Input } from "@/components/shadcn-ui/input"
import MagicTooltip from "@/components/base/MagicTooltip"
import { isReadOnlyProject } from "@/pages/superMagic/utils/permission"
import { usePersonaResearchStore } from "../context"

interface StudyTitleEditorProps {
	topicId: string
	/** Current study title; empty while the study has no name yet. */
	title: string
}

/**
 * Studio heading that renames the study in place: click to edit, Enter or blur saves, Escape
 * cancels. The new name is the topic name, so the home list and share page follow it.
 */
function StudyTitleEditor({ topicId, title }: StudyTitleEditorProps) {
	const { t } = useTranslation("personaResearch")
	const store = usePersonaResearchStore()
	// null while showing the title; a string while the input is open.
	const [draft, setDraft] = useState<string | null>(null)
	const [isSaving, setIsSaving] = useState(false)
	const editable = !store.isReadOnly && !isReadOnlyProject(store.selectedProject?.user_role)
	const displayTitle = title || t("study.untitled")

	// Switching studies discards an unsaved draft of the previous one.
	useEffect(() => setDraft(null), [topicId])

	const commit = useMemoizedFn(async () => {
		if (draft === null || isSaving) return
		const nextTitle = draft.trim()
		// An empty or unchanged name keeps the current title instead of failing.
		if (!nextTitle || nextTitle === title) {
			setDraft(null)
			return
		}
		setIsSaving(true)
		try {
			await store.renameStudy(topicId, nextTitle)
			setDraft(null)
		} catch (error) {
			console.error("Failed to rename research study:", error)
			// Keep the input open with the draft so the user can retry or press Escape.
			toast.error(t("study.renameFailed"))
		} finally {
			setIsSaving(false)
		}
	})

	const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		// Enter that confirms an IME candidate must not submit the name.
		if (event.nativeEvent.isComposing) return
		if (event.key === "Enter") {
			event.preventDefault()
			void commit()
		} else if (event.key === "Escape") {
			event.preventDefault()
			setDraft(null)
		}
	}

	if (draft !== null) {
		return (
			<Input
				autoFocus
				value={draft}
				disabled={isSaving}
				placeholder={t("study.untitled")}
				aria-label={t("study.rename")}
				className="h-7 min-w-0 flex-1 px-2 text-sm font-semibold"
				onChange={(event) => setDraft(event.target.value)}
				onBlur={() => void commit()}
				onKeyDown={handleKeyDown}
				onFocus={(event) => event.target.select()}
			/>
		)
	}

	if (!editable) return <h1 className="truncate text-sm font-semibold">{displayTitle}</h1>

	return (
		<h1 className="min-w-0 text-sm font-semibold">
			<MagicTooltip title={t("study.rename")}>
				<button
					type="button"
					className="group flex max-w-full items-center gap-1.5 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
					onClick={() => setDraft(title)}
				>
					<span className="truncate">{displayTitle}</span>
					{/* The pencil appears on hover or keyboard focus so the heading stays quiet. */}
					<PencilLine className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
				</button>
			</MagicTooltip>
		</h1>
	)
}

export default observer(StudyTitleEditor)
