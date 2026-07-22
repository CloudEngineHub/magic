import { useEffect, useMemo, useRef, useState } from "react"
import {
	resolveSingleHtmlStaticDependencies,
	type HtmlStaticDependencyAttachment,
} from "@/pages/superMagic/utils/htmlStaticDependencies"
import type { AttachmentIndex } from "@/pages/superMagic/components/TopicFilesButton/utils/attachmentIndex"

interface SingleHtmlStaticDependencyState {
	fileId: string | null
	isLoading: boolean
	isHtml: boolean
	dependencyFileIds: string[]
	dependencyTransferFileIds: string[]
	error: Error | null
}

const INITIAL_STATE: SingleHtmlStaticDependencyState = {
	fileId: null,
	isLoading: false,
	isHtml: false,
	dependencyFileIds: [],
	dependencyTransferFileIds: [],
	error: null,
}

/**
 * Produces a primitive revision for the attachment fields that affect HTML dependency lookup.
 * This intentionally includes the nested tree order and paths, rather than only the root count.
 */
function getAttachmentDependencyRevision(attachments: HtmlStaticDependencyAttachment[]): string {
	const entries: string[] = []
	const stack = [...attachments].reverse()

	while (stack.length > 0) {
		const attachment = stack.pop()
		if (!attachment) continue

		entries.push(
			[
				attachment.file_id || "",
				attachment.file_name || "",
				attachment.file_extension || "",
				attachment.relative_file_path || "",
				attachment.is_directory ? "directory" : "file",
				attachment.is_hidden ? "hidden" : "visible",
				JSON.stringify(attachment.display_config || null),
			].join("\u0001"),
		)

		const children = attachment.children || []
		for (let index = children.length - 1; index >= 0; index -= 1) {
			stack.push(children[index])
		}
	}

	return entries.join("\u0002")
}

function getAttachmentIndexRevision(attachmentIndex?: AttachmentIndex): string {
	if (!attachmentIndex) return ""

	return attachmentIndex.allKeys
		.map((key) => {
			const entry = attachmentIndex.getEntryByKey(key)
			return `${key}\u0001${entry?.parentKey || ""}`
		})
		.join("\u0002")
}

/**
 * Re-runs analysis when the selected file or dependency-relevant attachment metadata changes.
 * The primitive revisions avoid coupling the effect to transient array and index identities.
 */
export function useSingleHtmlStaticDependencies({
	active,
	fileIds,
	attachments,
	attachmentIndex,
}: {
	active: boolean
	fileIds: string[]
	attachments: HtmlStaticDependencyAttachment[]
	attachmentIndex?: AttachmentIndex
}): SingleHtmlStaticDependencyState {
	const attachmentsRef = useRef(attachments)
	attachmentsRef.current = attachments
	const attachmentIndexRef = useRef(attachmentIndex)
	attachmentIndexRef.current = attachmentIndex

	const [state, setState] = useState<SingleHtmlStaticDependencyState>(INITIAL_STATE)
	const selectedFileId = fileIds.length === 1 ? fileIds[0] : ""
	const attachmentDependencyRevision = useMemo(
		() => getAttachmentDependencyRevision(attachments),
		[attachments],
	)
	const attachmentIndexRevision = useMemo(
		() => getAttachmentIndexRevision(attachmentIndex),
		[attachmentIndex],
	)

	useEffect(() => {
		let cancelled = false

		if (!active || !selectedFileId) {
			setState(INITIAL_STATE)
			return
		}

		setState({
			fileId: selectedFileId,
			isLoading: true,
			isHtml: false,
			dependencyFileIds: [],
			dependencyTransferFileIds: [],
			error: null,
		})

		resolveSingleHtmlStaticDependencies({
			fileIds: [selectedFileId],
			attachments: attachmentsRef.current,
			attachmentIndex: attachmentIndexRef.current,
		})
			.then((result) => {
				if (cancelled) return
				setState({
					fileId: selectedFileId,
					isLoading: false,
					isHtml: result.isHtml,
					dependencyFileIds: result.dependencyFileIds,
					dependencyTransferFileIds: result.dependencyTransferFileIds,
					error: null,
				})
			})
			.catch((error: unknown) => {
				if (cancelled) return
				setState({
					fileId: selectedFileId,
					isLoading: false,
					isHtml: true,
					dependencyFileIds: [],
					dependencyTransferFileIds: [],
					error: error instanceof Error ? error : new Error(String(error)),
				})
			})

		return () => {
			cancelled = true
		}
	}, [active, attachmentDependencyRevision, attachmentIndexRevision, selectedFileId])

	return state
}
