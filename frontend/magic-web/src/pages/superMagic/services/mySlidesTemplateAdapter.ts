export interface MySlidesTemplate {
	id: string
	name: string
	templateId?: string
	description?: string
	thumbnailUrl?: string
	collageUrl?: string
	previewUrl?: string
	previewImageUrls?: string[]
}

export interface MySlidesTemplatePage {
	items: MySlidesTemplate[]
	total: number
	page: number
	pageSize: number
}

export interface MySlidesTemplateAdapter {
	enabled: boolean
	listMine(params: {
		page: number
		pageSize: number
		keyword?: string
	}): Promise<MySlidesTemplatePage>
	checkByTemplateId?(input: {
		templateId: string
	}): Promise<{ exists: boolean; template?: MySlidesTemplate }>
	saveFromFolder(input: {
		projectId: string
		folderId: string
		folderName: string
		mode?: "create" | "overwrite"
		targetId?: string
	}): Promise<MySlidesTemplate>
}

export class MySlidesTemplateAdapterUnavailableError extends Error {
	constructor() {
		super("My slides template adapter is not configured")
		this.name = "MySlidesTemplateAdapterUnavailableError"
	}
}

/** Default adapter deliberately avoids guessing an unavailable backend endpoint. */
export const mySlidesTemplateAdapter: MySlidesTemplateAdapter = {
	enabled: false,
	async listMine() {
		throw new MySlidesTemplateAdapterUnavailableError()
	},
	async checkByTemplateId() {
		throw new MySlidesTemplateAdapterUnavailableError()
	},
	async saveFromFolder() {
		throw new MySlidesTemplateAdapterUnavailableError()
	},
}
