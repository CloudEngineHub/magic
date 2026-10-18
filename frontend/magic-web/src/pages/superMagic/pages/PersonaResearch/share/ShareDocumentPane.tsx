import { useEffect, useState } from "react"
import { FileText } from "lucide-react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/shadcn-ui/empty"
import { ScrollArea } from "@/components/shadcn-ui/scroll-area"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import { getFileContentById } from "@/pages/superMagic/utils/api"
import { usePersonaResearchStore } from "../context"
import MarkdownFilePane from "../components/MarkdownFilePane"
import { attachmentVersionKey, getAttachmentPath } from "../services/researchFiles"

/**
 * Read-only document view for the share page: the HTML report in a sandboxed frame,
 * Markdown documents (plan, desk research, questionnaire) as formatted text.
 */
function ShareDocumentPane({ file }: { file: AttachmentItem | null }) {
	const { t } = useTranslation("personaResearch")
	if (!file) {
		return (
			<Empty className="h-full border-0 py-12">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<FileText />
					</EmptyMedia>
					<EmptyTitle className="text-sm">{t("share.noDocumentTitle")}</EmptyTitle>
					<EmptyDescription className="text-xs">{t("share.noDocument")}</EmptyDescription>
				</EmptyHeader>
			</Empty>
		)
	}
	if (getAttachmentPath(file).endsWith(".html")) return <HtmlDocument file={file} />
	return (
		<ScrollArea className="h-full">
			<div className="mx-auto max-w-3xl p-5 text-sm">
				<MarkdownFilePane file={file} copyable />
			</div>
		</ScrollArea>
	)
}

/** Report HTML runs in a sandbox without same-origin access, so it cannot touch the page. */
const HtmlDocument = observer(function HtmlDocument({ file }: { file: AttachmentItem }) {
	const { t } = useTranslation("personaResearch")
	const store = usePersonaResearchStore()
	const versionKey = attachmentVersionKey(file)
	const [html, setHtml] = useState<string | null>(null)
	const [failed, setFailed] = useState(false)

	useEffect(() => {
		const controller = new AbortController()
		setFailed(false)
		getFileContentById(String(file.file_id), {
			responseType: "text",
			signal: controller.signal,
			access: store.fileAccess,
		})
			.then((value) => {
				if (!controller.signal.aborted && typeof value === "string") setHtml(value)
			})
			.catch(() => {
				if (!controller.signal.aborted) setFailed(true)
			})
		return () => controller.abort()
		// versionKey covers file_id and rewrites.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [versionKey, store.fileAccess])

	if (html === null) {
		return (
			<p className="p-4 text-sm text-muted-foreground">
				{failed ? t("state.fileLoadFailed") : t("state.fileLoading")}
			</p>
		)
	}
	return (
		<iframe
			title={file.file_name ?? "report"}
			srcDoc={html}
			sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
			className="size-full border-0 bg-white"
		/>
	)
})

export default observer(ShareDocumentPane)
