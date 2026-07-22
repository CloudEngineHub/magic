import type { DesignData } from "../types"
import type {
	CanvasConnection,
	CanvasDocumentMergeConnectionConflictReason,
	CanvasDocumentMergeElementConflictReason,
	LayerElement,
} from "@/components/CanvasDesign/runtime/document"
import type { FileItem } from "@/pages/superMagic/components/Detail/components/FilesViewer/types"
import type { DesignAttachmentIndex } from "../utils/designAttachmentIndex"
import type { FileHistoryVersion } from "@/pages/superMagic/pages/Workspace/types"

export type DesignRemoteUpdateListenerMode = "message" | "file-change"

export type DesignConflictReason =
	| "remote-update-with-local-dirty"
	| "save-version-conflict"
	| "draft-remote-advanced"
	| "element-level-conflict"
	| "connection-level-conflict"

export type DesignElementConflictReason = CanvasDocumentMergeElementConflictReason
export type DesignConnectionConflictReason = CanvasDocumentMergeConnectionConflictReason

export type DesignElementConflictStatus = "unresolved" | "resolved"
export type DesignConnectionConflictStatus = "unresolved" | "resolved"

export interface DesignElementConflict {
	elementId: string
	reason: DesignElementConflictReason
	status: DesignElementConflictStatus
	baseElement: LayerElement | null
	localElement: LayerElement | null
	remoteElement: LayerElement | null
	baseParentId: string | null
	localParentId: string | null
	remoteParentId: string | null
	createdAt: number
	resolvedAt?: number
	resolution?: "use-local" | "use-remote"
}

export interface DesignConnectionConflict {
	connectionId: string
	reason: DesignConnectionConflictReason
	status: DesignConnectionConflictStatus
	baseConnection: CanvasConnection | null
	localConnection: CanvasConnection | null
	remoteConnection: CanvasConnection | null
	createdAt: number
	resolvedAt?: number
	resolution?: "use-local" | "use-remote"
}

export interface DesignConflict {
	reason: DesignConflictReason
	baseVersion: number | null
	localVersion: number | null
	remoteVersion: number | null
	baseFingerprint: string
	localFingerprint: string
	remoteFingerprint: string
	localData: DesignData
	remoteData: DesignData
	createdAt: number
	localDataRestored?: boolean
	elementConflicts?: DesignElementConflict[]
	connectionConflicts?: DesignConnectionConflict[]
	mergedData?: DesignData
}

export interface DesignProjectManagerOptions {
	currentFile?: { id: string; name: string }
	attachments?: FileItem[]
	flatAttachments?: FileItem[]
	projectPath?: string
	projectId?: string
	allowEdit: boolean
	isPlaybackMode: boolean
	isShareRoute: boolean
	isMobile: boolean
	designProjectId?: string
	designProjectName?: string
	/** 扁平附件索引：远端同步 / 路径解析等链路复用，避免重复 O(N) 扫描 */
	attachmentIndex?: DesignAttachmentIndex | null
	selectedTopicId?: string | null
	onRemoteDesignDataUpdate?: (
		oldDesignData: DesignData,
		newDesignData: DesignData,
		updateType: "message" | "revoke" | "restore" | "draft",
	) => void
	updateListenerDebounceMs?: number
	remoteUpdateListenerMode?: DesignRemoteUpdateListenerMode
	onVersionChange?: (designData: DesignData, isViewingHistory: boolean) => void
	/** i18n 翻译函数，用于 toasts 等 */
	getT?: () => (key: string) => string
}

export interface DesignProjectStateBagSetters {
	setMagicProjectJsFileId: (v: string | null) => void
	setDesignData: (data: DesignData) => void
	setIsInitialLoading: (v: boolean) => void
	setIsSaving: (v: boolean) => void
	setIsReadOnly: (v: boolean) => void
	setFileVersionsList: (v: FileHistoryVersion[]) => void
	setFileVersion: (v: number | undefined) => void
	setIsProcessingRevoke: (v: boolean) => void
	setRevokeType: (v: "revoke" | "restore" | null) => void
	setConflictState: (v: DesignConflict | null) => void
}

export interface DesignProjectStateBag {
	getDesignData: () => DesignData
	getConflictState: () => DesignConflict | null
	getMagicProjectJsFileId: () => string | null
	getMagicProjectJsVersion: () => number | null
	setMagicProjectJsVersion: (v: number | null) => void
	/** 空字符串表示尚未建立基线（等价于旧逻辑的「空字符串」） */
	getPrevDesignDataFingerprint: () => string
	setPrevDesignDataFingerprint: (v: string) => void
	getIsReadOnly: () => boolean
	setters: DesignProjectStateBagSetters
}

export function getDataToCompare(data: DesignData) {
	return {
		type: data.type,
		name: data.name,
		version: data.version,
		canvas: {
			elements: data.canvas?.elements || [],
			connections: data.canvas?.connections || [],
		},
	}
}
