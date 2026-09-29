import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import type { Editor } from "@/infrastructure/editors/tiptap/core"
import type { AiPatchState } from "@/components/tiptap-node/ai-patch"

export default function PPTNotesPatchReview({
	editor,
	patchState,
	readOnly,
}: {
	editor: Editor | null
	patchState: AiPatchState | undefined
	readOnly: boolean
}) {
	const { t } = useTranslation("super")
	return (
		<>
			{Boolean(patchState?.patches.length) && patchState?.phase === "review" && (
				<div
					className="flex flex-wrap items-center gap-1 border-b border-border px-3 py-2"
					role="group"
					aria-label={t("ppt.speakerNotes.reviewChanges")}
				>
					<span className="mr-auto text-xs text-muted-foreground">
						{t("ppt.speakerNotes.pendingChanges", {
							count: patchState?.patches.length,
						})}
					</span>
					<Button
						size="sm"
						variant="ghost"
						disabled={readOnly}
						onClick={() => editor?.commands.acceptAiPatch(patchState?.patches[0]?.id)}
					>
						{t("ppt.speakerNotes.acceptChange")}
					</Button>
					<Button
						size="sm"
						variant="ghost"
						onClick={() => editor?.commands.rejectAiPatch(patchState?.patches[0]?.id)}
					>
						{t("ppt.speakerNotes.rejectChange")}
					</Button>
					<Button
						size="sm"
						variant="outline"
						disabled={readOnly}
						onClick={() => editor?.commands.acceptAiPatch()}
					>
						{t("ppt.speakerNotes.acceptAllChanges")}
					</Button>
					<Button
						size="sm"
						variant="ghost"
						onClick={() => editor?.commands.rejectAiPatch()}
					>
						{t("ppt.speakerNotes.rejectAllChanges")}
					</Button>
				</div>
			)}
			{Boolean(patchState?.invalidatedCount) && (
				<p role="status" className="px-3 py-1 text-xs text-muted-foreground">
					{t("ppt.speakerNotes.patchConflict")}
				</p>
			)}
		</>
	)
}
