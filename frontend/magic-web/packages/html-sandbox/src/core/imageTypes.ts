export type ImageActionType =
	| "replace-element-image"
	| "set-element-background-image"
	| "remove-element-background-image"
	| "insert-floating-image"

export interface ImageActionPayload {
	action: ImageActionType
}

export interface ImageUploadRequestPayload {
	requestId: string
	action: Extract<
		ImageActionType,
		"replace-element-image" | "set-element-background-image" | "insert-floating-image"
	>
	selector: string
	suggestedPath: string
}

export interface ImageUploadResultPayload {
	requestId: string
	action: ImageUploadRequestPayload["action"]
	selector: string
	success: boolean
	cancelled?: boolean
	previewUrl?: string
	relativeFilePath?: string
	error?: string
}
