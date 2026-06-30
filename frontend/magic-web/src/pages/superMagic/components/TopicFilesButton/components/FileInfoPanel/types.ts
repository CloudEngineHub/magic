import type { AttachmentItem } from "../../hooks/types"

export interface FileInfoMetric {
	key: string
	labelKey: string
	value: string
}

export interface FileInfoField {
	key: string
	labelKey: string
	value: string
	copyable?: boolean
}

export interface FileInfoSpecialSection {
	type: string
	typeLabelKey: string
	fields: FileInfoField[]
	chips?: string[]
	previewItems?: string[]
}

export interface FileInfoStats {
	directChildren: number
	fileCount: number
	folderCount: number
	hiddenCount: number
	totalSize: number
}

export interface FileInfoModel {
	item: AttachmentItem
	displayName: string
	path: string
	iconType: string
	typeLabelKey: string
	typeLabelFallback?: string
	isDirectory: boolean
	metrics: FileInfoMetric[]
	generalFields: FileInfoField[]
	contentFields: FileInfoField[]
	specialSection?: FileInfoSpecialSection
	technicalFields: FileInfoField[]
}
