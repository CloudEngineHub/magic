export interface TemplateColorExtractionRequest {
	imageUrl: string
	requestId: string
}

export interface TemplateColorExtractionResponse {
	colors: string[]
	error?: string
	requestId: string
}
