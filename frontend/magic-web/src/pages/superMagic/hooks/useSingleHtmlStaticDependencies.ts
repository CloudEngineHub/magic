import { useEffect, useRef, useState } from "react"
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
 * Keeps the potentially large attachment tree in a ref so selection changes (and the initial
 * attachment-tree load) are the only triggers; routine attachment refreshes do not re-download HTML.
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
	const attachmentRootCount = attachments.length

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
	}, [active, attachmentIndex, attachmentRootCount, selectedFileId])

	return state
}
