import type { CSSProperties } from "react"
import type { SelfMediaPlatform } from "../../../types"
import type { SelfMediaAttachmentNode } from "../types"
import type { SelfMediaPlatformPostItem } from "../stores/SelfMediaStore"

export interface AICardFolderChild extends SelfMediaAttachmentNode {
	display_config?: {
		type?: string
		[key: string]: unknown
	}
}

export interface AICardFolderItem extends AICardFolderChild {
	file_id: string
	children?: AICardFolderChild[]
}

export interface SelfMediaHomeOpeningPost {
	postKey: string
	style: CSSProperties
}

export interface SelfMediaHomePostGroup {
	platform: SelfMediaPlatform
	posts: SelfMediaPlatformPostItem[]
}

export type SelfMediaHomeTranslate = (key: string, options?: Record<string, unknown>) => string
