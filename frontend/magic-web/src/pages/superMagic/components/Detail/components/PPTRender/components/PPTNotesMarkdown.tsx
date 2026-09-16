import { useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import { SimpleEditor } from "@/components/tiptap-templates/simple/simple-editor"
import type { SimpleEditorRef } from "@/components/tiptap-templates/simple/types"

interface PPTNotesMarkdownProps {
	value: string
	readOnly: boolean
	onChange: (value: string) => void
	onSave: () => void
}

/** Markdown stays rendered while the user edits it directly in the shared rich-text editor. */
export default function PPTNotesMarkdown({
	value,
	readOnly,
	onChange,
	onSave,
}: PPTNotesMarkdownProps) {
	const { t } = useTranslation("super")
	const editorRef = useRef<SimpleEditorRef>(null)

	useEffect(() => {
		const editor = editorRef.current?.editor
		if (!editor || editor.isDestroyed) return
		const current = (
			editor.storage as { markdown?: { getMarkdown: () => string } }
		).markdown?.getMarkdown()
		// Accept AI/server updates without resetting the cursor on local typing or creating a new edit.
		if (current !== value) editor.commands.setContent(value, false)
	}, [value])

	return (
		<div
			data-testid="ppt-speaker-notes-content"
			className="mx-3 mb-3 min-h-0 flex-1 overflow-hidden rounded-lg bg-muted/40 text-[13px] leading-6 text-foreground focus-within:ring-1 focus-within:ring-ring/40"
			onKeyDown={(event) => {
				// Notes own the arrow keys and save shortcut; do not navigate the slide behind them.
				event.stopPropagation()
				if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
					event.preventDefault()
					onSave()
				}
			}}
			onBlur={(event) => {
				// Header actions save explicitly; avoid disabling their target before click fires.
				const panel =
					event.currentTarget.closest('[data-testid="ppt-speaker-notes-panel"]') ||
					event.currentTarget
				if (!panel.contains(event.relatedTarget)) onSave()
			}}
		>
			<SimpleEditor
				ref={editorRef}
				content={value}
				isEditable={!readOnly}
				showToolbar={false}
				enableDragHandle={false}
				enableSearchReplace={false}
				placeholder={
					readOnly ? t("ppt.speakerNotes.empty") : t("ppt.speakerNotes.placeholder")
				}
				onContentChange={onChange}
				onSave={onSave}
				className="!bg-transparent [&_.tiptap.ProseMirror.simple-editor]:!px-3 [&_.tiptap.ProseMirror.simple-editor]:!py-2 [&_.tiptap.ProseMirror.simple-editor]:!text-[13px] [&_.tiptap.ProseMirror.simple-editor]:!leading-6"
			/>
		</div>
	)
}
