import { useEffect, useState } from "react"
import {
	resolveSingleDocumentStaticDependencies,
	type StaticDependencyAttachment,
	type StaticDependencyFileType,
} from "@/pages/superMagic/utils/staticDependencies"
import type { AttachmentIndex } from "@/pages/superMagic/components/TopicFilesButton/utils/attachmentIndex"

export interface SingleDocumentStaticDependencyState {
	fileId: string | null
	isLoading: boolean
	fileType: StaticDependencyFileType | null
	dependencyFileIds: string[]
	dependencyTransferFileIds: string[]
	missingResourcePaths: string[]
	error: Error | null
}

const INITIAL_STATE: SingleDocumentStaticDependencyState = {
	fileId: null,
	isLoading: false,
	fileType: null,
	dependencyFileIds: [],
	dependencyTransferFileIds: [],
	missingResourcePaths: [],
	error: null,
}

/** Resolves dependencies for the selected document. */
export function useSingleDocumentStaticDependencies({
	active,
	fileIds,
	attachments,
	attachmentIndex,
}: {
	active: boolean
	fileIds: string[]
	attachments: StaticDependencyAttachment[]
	attachmentIndex?: AttachmentIndex
}): SingleDocumentStaticDependencyState {
	const [state, setState] = useState<SingleDocumentStaticDependencyState>(INITIAL_STATE)
	const selectedFileId = fileIds.length === 1 ? fileIds[0] : ""

	useEffect(() => {
		let cancelled = false

		if (!active || !selectedFileId) {
			setState(INITIAL_STATE)
			return
		}

		setState({ ...INITIAL_STATE, fileId: selectedFileId, isLoading: true })

		resolveSingleDocumentStaticDependencies({
			fileIds: [selectedFileId],
			attachments,
			attachmentIndex,
		})
			.then((result) => {
				if (cancelled) return
				setState({
					fileId: selectedFileId,
					isLoading: false,
					fileType: result.fileType,
					dependencyFileIds: result.dependencyFileIds,
					dependencyTransferFileIds: result.dependencyTransferFileIds,
					missingResourcePaths: result.missingResourcePaths,
					error: null,
				})
			})
			.catch((error: unknown) => {
				if (cancelled) return
				setState({
					...INITIAL_STATE,
					fileId: selectedFileId,
					isLoading: false,
					error: error instanceof Error ? error : new Error(String(error)),
				})
			})

		return () => {
			cancelled = true
		}
	}, [active, attachmentIndex, attachments, selectedFileId])

	return state
}
