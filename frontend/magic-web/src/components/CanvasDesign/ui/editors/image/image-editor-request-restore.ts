import type { GenerateImageRequest } from "../../../public/magic-types"

interface ResolveImageEditorRequestToRestoreOptions {
	currentRequest?: GenerateImageRequest
	tempRequest?: Partial<GenerateImageRequest>
	/** 失败重试时，以已受理任务的请求为准，避免临时草稿覆盖其输入。 */
	preferCurrentRequest?: boolean
}

export function resolveImageEditorRequestToRestore({
	currentRequest,
	tempRequest,
	preferCurrentRequest = false,
}: ResolveImageEditorRequestToRestoreOptions): Partial<GenerateImageRequest> | undefined {
	if (preferCurrentRequest && currentRequest) {
		return currentRequest
	}

	if (!tempRequest) return currentRequest

	return {
		...currentRequest,
		...tempRequest,
		prompt: tempRequest.prompt ?? currentRequest?.prompt,
		reference_images: tempRequest.reference_images ?? currentRequest?.reference_images,
	}
}
