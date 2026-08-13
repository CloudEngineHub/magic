import { useMemo, useCallback } from "react"
import type {
	CanvasDesignStorageData,
	GenerateImageRequest,
	GenerateVideoRequest,
	StoredVideoModeDraftsMap,
	StoredVideoModeInputDraft,
} from "@/components/CanvasDesign/public/magic-types"
import { CanvasDesignRootStorageData } from "@/components/CanvasDesign/public/magic-types"
import type { FileItem } from "@/pages/superMagic/components/Detail/components/FilesViewer/types"
import type { DesignAttachmentIndex } from "../utils/designAttachmentIndex"
import {
	normalizeDesignPathForTransitionMigration,
	type DesignPathTransitionMigrationContext,
} from "../utils/designPathTransitionMigration"

interface UseCanvasStorageOptions {
	designProjectId?: string
	designProjectBasePath?: string
	flatAttachments?: FileItem[]
	attachmentIndex?: DesignAttachmentIndex | null
}

interface UseCanvasStorageReturn {
	getStorage: () => CanvasDesignStorageData | null
	saveStorage: (data: CanvasDesignStorageData) => void
	getRootStorage: () => CanvasDesignRootStorageData | null
	saveRootStorage: (data: CanvasDesignRootStorageData) => void
}

/**
 * Canvas 本地存储功能 Hook
 * 职责：管理 Canvas 的本地存储数据
 * - 基于目录 ID (markId) 生成存储键
 * - 从 localStorage 读取存储数据
 * - 将存储数据保存到 localStorage
 */
export function useCanvasStorage(options: UseCanvasStorageOptions): UseCanvasStorageReturn {
	const { designProjectId, designProjectBasePath, flatAttachments, attachmentIndex } = options
	const pathContext = useMemo<DesignPathTransitionMigrationContext>(
		() => ({
			designProjectBasePath,
			flatAttachments,
			attachmentIndex,
		}),
		[attachmentIndex, designProjectBasePath, flatAttachments],
	)

	// 获取 storage key（基于目录 ID），用于 viewport、图层 UI 和 minimapOpen 等项目级状态。
	const storageKey = useMemo(() => {
		return designProjectId ? `MAGIC:supermagic-design:${designProjectId}` : null
	}, [designProjectId])

	const rootStorageKey = `MAGIC:supermagic-design`

	/**
	 * 获取存储数据
	 */
	const getStorage = useCallback((): CanvasDesignStorageData | null => {
		if (!storageKey) {
			return null
		}
		try {
			const stored = localStorage.getItem(storageKey)
			if (stored) {
				return normalizeCanvasStorageData(
					JSON.parse(stored) as CanvasDesignStorageData,
					pathContext,
				)
			}
			return null
		} catch (error) {
			return null
		}
	}, [storageKey, pathContext])

	/**
	 * 保存存储数据
	 */
	const saveStorage = useCallback(
		(data: CanvasDesignStorageData): void => {
			if (!storageKey) {
				return
			}
			try {
				localStorage.setItem(
					storageKey,
					JSON.stringify(normalizeCanvasStorageData(data, pathContext)),
				)
			} catch (error) {
				//
			}
		},
		[storageKey, pathContext],
	)

	/**
	 * 获取根存储数据
	 */
	const getRootStorage = useCallback((): CanvasDesignRootStorageData | null => {
		try {
			const stored = localStorage.getItem(rootStorageKey)
			if (stored) {
				return JSON.parse(stored) as CanvasDesignRootStorageData
			}
			return null
		} catch (error) {
			return null
		}
	}, [rootStorageKey])

	/**
	 * 保存根存储数据
	 */
	const saveRootStorage = useCallback(
		(data: CanvasDesignRootStorageData): void => {
			try {
				localStorage.setItem(rootStorageKey, JSON.stringify(data))
			} catch (error) {
				//
			}
		},
		[rootStorageKey],
	)

	return {
		getStorage,
		saveStorage,
		getRootStorage,
		saveRootStorage,
	}
}

/**
 * 过渡期本地草稿修复：裸 `images/...` 必须由附件唯一确认后才能写成 `./...`。
 */
export function normalizeCanvasStorageData(
	data: CanvasDesignStorageData,
	pathContext: DesignPathTransitionMigrationContext,
): CanvasDesignStorageData {
	return {
		...data,
		tempImageConfigs: normalizeTempImageConfigs(data.tempImageConfigs, pathContext),
		tempVideoConfigs: normalizeTempVideoConfigs(data.tempVideoConfigs, pathContext),
		tempVideoModeDrafts: normalizeTempVideoModeDrafts(data.tempVideoModeDrafts, pathContext),
	}
}

function normalizeStoragePath(
	path: string,
	pathContext: DesignPathTransitionMigrationContext,
): string {
	return normalizeDesignPathForTransitionMigration(path, pathContext)
}

function normalizeTempImageConfigs(
	configs: CanvasDesignStorageData["tempImageConfigs"],
	pathContext: DesignPathTransitionMigrationContext,
): CanvasDesignStorageData["tempImageConfigs"] {
	if (!configs) return configs

	return Object.fromEntries(
		Object.entries(configs).map(([elementId, config]) => [
			elementId,
			normalizeTempImageConfig(config, pathContext),
		]),
	)
}

function normalizeTempImageConfig(
	config: Partial<GenerateImageRequest>,
	pathContext: DesignPathTransitionMigrationContext,
): Partial<GenerateImageRequest> {
	const referenceImageOptions = config.reference_image_options
	const normalizedReferenceImageOptions = referenceImageOptions?.length
		? referenceImageOptions.map((entry) => ({
				...entry,
				path: normalizeStoragePath(entry.path, pathContext),
			}))
		: undefined

	return {
		...config,
		reference_images: config.reference_images?.map((path) =>
			normalizeStoragePath(path, pathContext),
		),
		reference_image_options: normalizedReferenceImageOptions,
	}
}

function normalizeTempVideoConfigs(
	configs: CanvasDesignStorageData["tempVideoConfigs"],
	pathContext: DesignPathTransitionMigrationContext,
): CanvasDesignStorageData["tempVideoConfigs"] {
	if (!configs) return configs

	return Object.fromEntries(
		Object.entries(configs).map(([elementId, config]) => [
			elementId,
			normalizeTempVideoConfig(config, pathContext),
		]),
	)
}

function normalizeTempVideoModeDrafts(
	drafts: CanvasDesignStorageData["tempVideoModeDrafts"],
	pathContext: DesignPathTransitionMigrationContext,
): CanvasDesignStorageData["tempVideoModeDrafts"] {
	if (!drafts) return drafts

	return Object.fromEntries(
		Object.entries(drafts).map(([elementId, map]) => [
			elementId,
			normalizeSingleElementModeDrafts(map, pathContext),
		]),
	)
}

function normalizeSingleElementModeDrafts(
	map: StoredVideoModeDraftsMap | undefined,
	pathContext: DesignPathTransitionMigrationContext,
): StoredVideoModeDraftsMap {
	if (!map) return {}

	const next: StoredVideoModeDraftsMap = { ...map }
	for (const key of ["keyframe_guided", "image_reference", "omni_reference"] as const) {
		const draft = map[key]
		if (!draft) continue
		next[key] = normalizeOneModeDraft(draft, pathContext)
	}
	return next
}

function normalizeOneModeDraft(
	draft: StoredVideoModeInputDraft,
	pathContext: DesignPathTransitionMigrationContext,
): StoredVideoModeInputDraft {
	return {
		frameImageInfos: draft.frameImageInfos.map((slot) =>
			slot
				? {
						...slot,
						path: normalizeStoragePath(slot.path, pathContext),
						src: slot.src ? normalizeStoragePath(slot.src, pathContext) : slot.src,
					}
				: slot,
		),
		referenceImageInfos: draft.referenceImageInfos.map((info) => ({
			...info,
			path: normalizeStoragePath(info.path, pathContext),
			src: info.src ? normalizeStoragePath(info.src, pathContext) : info.src,
		})),
	}
}

function normalizeTempVideoConfig(
	config: Partial<GenerateVideoRequest>,
	pathContext: DesignPathTransitionMigrationContext,
): Partial<GenerateVideoRequest> {
	const inputs = config.inputs
	if (!inputs) return config

	return {
		...config,
		inputs: {
			...inputs,
			...(inputs.frames?.length
				? {
						frames: inputs.frames.map((item) => ({
							...item,
							uri: normalizeStoragePath(item.uri, pathContext),
						})),
					}
				: {}),
			...(inputs.reference_images?.length
				? {
						reference_images: inputs.reference_images.map((item) => ({
							...item,
							uri: normalizeStoragePath(item.uri, pathContext),
						})),
					}
				: {}),
			...(inputs.reference_videos?.length
				? {
						reference_videos: inputs.reference_videos.map((item) => ({
							...item,
							uri: normalizeStoragePath(item.uri, pathContext),
						})),
					}
				: {}),
			...(inputs.reference_audios?.length
				? {
						reference_audios: inputs.reference_audios.map((item) => ({
							...item,
							uri: normalizeStoragePath(item.uri, pathContext),
						})),
					}
				: {}),
			...(inputs.video?.uri
				? {
						video: {
							...inputs.video,
							uri: normalizeStoragePath(inputs.video.uri, pathContext),
						},
					}
				: {}),
			...(inputs.mask?.uri
				? {
						mask: {
							...inputs.mask,
							uri: normalizeStoragePath(inputs.mask.uri, pathContext),
						},
					}
				: {}),
			...(inputs.audio?.length
				? {
						audio: inputs.audio.map((item) => ({
							...item,
							uri: normalizeStoragePath(item.uri, pathContext),
						})),
					}
				: {}),
		},
	}
}
