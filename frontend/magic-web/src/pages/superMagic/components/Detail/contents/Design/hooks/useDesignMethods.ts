import { useMemo, useCallback } from "react"
import { useTranslation } from "react-i18next"
import MagicModal, { type ModalFuncProps } from "@/components/base/MagicModal"
import type { Topic, Workspace, ProjectListItem } from "@/pages/superMagic/pages/Workspace/types"
import type {
	CanvasDesignMethods,
	EraserRequest,
	GenerateExtendedImageRequest,
	IdentifyImageMarkRequest,
	RemoveBackgroundRequest,
} from "@/components/CanvasDesign/public/magic-types"
import type { GenerateHightImageResponse as ApiGenerateHightImageResponse } from "@/apis/modules/superMagic"
import type { FileItem } from "@/pages/superMagic/components/Detail/components/FilesViewer/types"
import type { DesignAttachmentIndex } from "../utils/designAttachmentIndex"
import { SuperMagicApi } from "@/apis"
import { useGetOrCreateImagesDir } from "./useGetOrCreateImagesDir"
import { useImageGeneration } from "./useImageGeneration"
import { useImagePromptCompletion } from "./useImagePromptCompletion"
import { useVideoGeneration } from "./useVideoGeneration"
import { useFileUpload } from "./useFileUpload"
import { useFileInfoProvider } from "./useFileInfoProvider"
import { useCanvasStorage } from "./useCanvasStorage"
import { useConversationAndDownload } from "./useConversationAndDownload"
import {
	useHighImageGeneration,
	toCanvasGenerateHightImageResponse,
} from "./useHighImageGeneration"
import { useDesignFileDropPaths } from "./useDesignFileDropPaths"
import { resolveDesignImagesFileDirWithSlash } from "./resolveDesignImagesFileDirWithSlash"
import { resolveDesignProjectBasePathFromAttachments } from "../utils/utils"
import {
	isCurrentCanvasResourcePath,
	isLegacyBareDesignResourcePath,
	isRelativeDesignPath,
	resolveDesignPathForOperation,
	toDesignDslPathFromWorkspacePath,
	toDesignApiPath,
	toWorkspaceAbsoluteApiPath,
	toWorkspaceAbsoluteApiPathForOperation,
	toWorkspaceRelativeCandidates,
	toWorkspaceRelativePath,
} from "../utils/designPath"
import {
	buildReferenceImageOptions,
	getReferenceImageCrop,
} from "@/components/CanvasDesign/runtime/resources/image/imageCropUtils"
import { clipboard } from "@/utils/clipboard-helpers"
import type { UseDesignDownloadPolicyResult } from "./useDesignDownloadPolicy"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import { getPreviewFileUrlWatermarkSignature } from "@/utils/aiWatermarkPreviewFileUrlMode"

interface UseDesignMethodsOptions {
	projectId?: string
	designProjectId?: string
	selectedTopic?: Topic | null
	currentFile?: {
		id: string
		name: string
	}
	/** 已扁平化的附件列表 */
	flatAttachments?: FileItem[]
	/** 附件快照是否已由入口提供；观测过真实快照后，空数组也可能是一个有效快照 */
	attachmentsReady?: boolean
	/** 附件索引（路径/file_id 快速解析） */
	attachmentIndex?: DesignAttachmentIndex | null
	/** 添加文件到 MessageEditor 的回调函数（已废弃，保留以兼容旧代码） */
	onAddFilesToMessageEditor?: (files: File[]) => Promise<void>
	/** 选中的工作区（用于添加到新话题） */
	selectedWorkspace?: Workspace | null
	/** 选中的项目（用于添加到新话题） */
	selectedProject?: ProjectListItem | null
	/** 添加到当前话题后的回调 */
	afterAddFileToCurrentTopic?: () => void
	/** 添加到新话题后的回调 */
	afterAddFileToNewTopic?: () => void
	/** 退出全屏的回调 */
	onExitFullscreen?: () => void | Promise<void>
	/** 文件列表更新 */
	updateAttachments: () => void
	/** 下载策略（企业版可覆盖） */
	downloadPolicy: UseDesignDownloadPolicyResult
}

/**
 * Canvas Design Methods 聚合器 Hook
 * 职责：组合各个功能 hook，为 CanvasDesign 组件提供统一的 methods 接口
 * - 使用 useImageGeneration 提供图片生成功能
 * - 使用 useVideoGeneration 提供视频模型列表与视频生成/结果查询
 * - 使用 useFileUpload 提供文件上传功能（图片/视频，提示按 uploadSubDir 区分）
 * - 使用 useFileInfoProvider 提供文件信息获取功能
 * - 使用 useCanvasStorage 提供本地存储功能
 * - 使用 useConversationAndDownload 提供添加到对话和下载图片功能
 * - 使用 useDesignFileDropPaths 将项目文件拖拽路径转换为画布存储路径
 */
export function useDesignMethods(options: UseDesignMethodsOptions): CanvasDesignMethods {
	const {
		projectId,
		designProjectId,
		selectedTopic,
		currentFile,
		flatAttachments,
		attachmentsReady,
		attachmentIndex,
		onAddFilesToMessageEditor,
		selectedWorkspace,
		selectedProject,
		afterAddFileToCurrentTopic,
		afterAddFileToNewTopic,
		onExitFullscreen,
		updateAttachments,
		downloadPolicy,
	} = options

	const { t } = useTranslation("super")

	const designProjectBasePath = useMemo(
		() =>
			resolveDesignProjectBasePathFromAttachments({
				currentFile,
				flatAttachments,
			}),
		[currentFile, flatAttachments],
	)

	// 使用各个功能 hook（只传递 flatAttachments）
	const { getFileInfo, getFileResourceMeta, getFileInfoById, setFileInfoCache } =
		useFileInfoProvider({
			flatAttachments,
			attachmentsReady,
			designProjectBasePath,
			designProjectId,
			attachmentIndex,
		})

	const getOrCreateImagesDir = useGetOrCreateImagesDir({
		currentFile,
		flatAttachments,
		projectId,
		updateAttachments,
	})

	const {
		getImageModelList,
		generateImage,
		generateImages,
		getImageGenerationResult,
		getImageGenerationResults,
	} = useImageGeneration({
		projectId,
		currentFile,
		flatAttachments,
		designProjectBasePath,
		setFileInfoCache,
		updateAttachments,
		getOrCreateImagesDir,
	})

	const { completeImagePrompt, completeTextContent } = useImagePromptCompletion({
		projectId,
		flatAttachments,
		designProjectBasePath,
	})

	const { getVideoModelList, generateVideo, estimateVideoPoints, getVideoGenerationResult } =
		useVideoGeneration({
			projectId,
			topicMode: selectedTopic?.topic_mode,
			agentCode: selectedTopic?.agent_code,
			currentFile,
			flatAttachments,
			designProjectBasePath,
			setFileInfoCache,
			updateAttachments,
		})

	const { uploadFiles, uploadPrivateFiles } = useFileUpload({
		projectId,
		selectedTopic,
		currentFile,
		flatAttachments,
		getFileInfoById,
		setFileInfoCache,
		updateAttachments,
		getOrCreateImagesDir,
	})

	const { getStorage, saveStorage, getRootStorage, saveRootStorage } = useCanvasStorage({
		designProjectId,
		designProjectBasePath,
		flatAttachments,
		attachmentIndex,
	})

	const { addToConversation, downloadFiles } = useConversationAndDownload({
		flatAttachments,
		attachmentIndex,
		designProjectBasePath,
		onAddFilesToMessageEditor,
		selectedWorkspace,
		selectedProject,
		afterAddFileToCurrentTopic,
		afterAddFileToNewTopic,
		onExitFullscreen,
		downloadPolicy,
		projectId,
		currentFile,
	})

	const { generateHightImage, getConvertHightConfig } = useHighImageGeneration({
		projectId,
		currentFile,
		designProjectBasePath,
		flatAttachments,
	})

	const generateCanvasHightImage: CanvasDesignMethods["generateHightImage"] = useCallback(
		(params) =>
			generateHightImage(params) as ReturnType<CanvasDesignMethods["generateHightImage"]>,
		[generateHightImage],
	)

	const { getDataTransferFileInfo } = useDesignFileDropPaths({
		projectId,
		currentFile,
		flatAttachments,
		attachmentIndex,
		designProjectBasePath,
		updateAttachments,
		getOrCreateImagesDir,
		getFileInfoById,
		setFileInfoCache,
	})

	const normalizeComparablePath = useCallback(
		(path?: string) => {
			if (!path) return ""
			const resolvedPath = toWorkspaceRelativePath(path, {
				designProjectBasePath,
			})
			return resolvedPath
				.replace(/^\/+|\/+$/g, "")
				.replace(/\\/g, "/")
				.toLowerCase()
		},
		[designProjectBasePath],
	)

	const normalizeComparablePathCandidates = useCallback(
		(path?: string) => {
			if (!path) return []
			return toWorkspaceRelativeCandidates(path, {
				designProjectBasePath,
			}).map((candidate) =>
				candidate
					.replace(/^\/+|\/+$/g, "")
					.replace(/\\/g, "/")
					.toLowerCase(),
			)
		},
		[designProjectBasePath],
	)

	const locateProjectFile: NonNullable<CanvasDesignMethods["locateProjectFile"]> = useCallback(
		(params) => {
			const fallbackFileId = params.fileId?.trim()
			const comparableTargetPaths = normalizeComparablePathCandidates(params.filePath)

			let matchedFile: FileItem | null =
				attachmentIndex && fallbackFileId
					? (() => {
							const hit = attachmentIndex.byFileId.get(fallbackFileId)
							return hit && !hit.is_directory ? hit : null
						})()
					: null

			if (!matchedFile) {
				matchedFile =
					flatAttachments?.find((item) => {
						if (item.is_directory) return false
						if (fallbackFileId && item.file_id === fallbackFileId) return true
						if (comparableTargetPaths.length === 0) return false
						return comparableTargetPaths.includes(
							normalizeComparablePath(item.relative_file_path || ""),
						)
					}) || null
			}

			const fileId = matchedFile?.file_id || fallbackFileId
			if (!fileId) return

			pubsub.publish(PubSubEvents.Update_Active_File_Id, fileId)
			if (params.locateInTree ?? true) {
				pubsub.publish(PubSubEvents.Locate_File_In_Tree, fileId)
			}
		},
		[
			attachmentIndex,
			flatAttachments,
			normalizeComparablePath,
			normalizeComparablePathCandidates,
		],
	)

	const confirmModal: NonNullable<CanvasDesignMethods["confirmModal"]> = useCallback(
		(options) => {
			MagicModal.confirm({
				title: options.title,
				content: options.content as ModalFuncProps["content"],
				okText: options.okText,
				cancelText: options.cancelText,
				okButtonProps: options.okButtonProps as ModalFuncProps["okButtonProps"],
				cancelButtonProps: options.cancelButtonProps as ModalFuncProps["cancelButtonProps"],
				onOk: options.onOk,
				onCancel: options.onCancel,
			})
		},
		[],
	)

	const normalizeRequestApiPath = useCallback(
		(
			path: string,
			errorKey:
				| "design.errors.designResourcePathUnresolved"
				| "design.errors.removeBackgroundImagesDirUnresolved"
				| "design.errors.eraserImagesDirUnresolved"
				| "design.errors.expandImageImagesDirUnresolved",
			options?: { ensureTrailingSlash?: boolean },
		) => {
			const resolved = toDesignApiPath(path, { designProjectBasePath }, options)
			if (!resolved) throw new Error(t(errorKey))
			return resolved
		},
		[designProjectBasePath, t],
	)

	/** file_dir / file_path：接口要求带前导 `/` 的工作区 API 路径 */
	const resolveWorkspaceAbsoluteApiPath = useCallback(
		(
			path: string,
			errorKey:
				| "design.errors.designResourcePathUnresolved"
				| "design.errors.removeBackgroundImagesDirUnresolved"
				| "design.errors.eraserImagesDirUnresolved"
				| "design.errors.expandImageImagesDirUnresolved",
			options?: { ensureTrailingSlash?: boolean },
		) => {
			const resolved =
				isLegacyBareDesignResourcePath(path) && !options?.ensureTrailingSlash
					? toWorkspaceAbsoluteApiPathForOperation(
							path,
							{
								designProjectBasePath,
								flatAttachments,
								attachmentIndex,
								attachmentsReady,
							},
							options,
						)
					: toWorkspaceAbsoluteApiPath(path, { designProjectBasePath }, options)
			if (!resolved || (isRelativeDesignPath(path) && !resolved.startsWith("/"))) {
				throw new Error(t(errorKey))
			}
			return resolved
		},
		[attachmentIndex, attachmentsReady, designProjectBasePath, flatAttachments, t],
	)

	const resolveAbsolutePath: NonNullable<CanvasDesignMethods["resolveAbsolutePath"]> =
		useCallback(
			(path: string) => {
				if (isLegacyBareDesignResourcePath(path)) {
					const resolved = toWorkspaceAbsoluteApiPathForOperation(path, {
						designProjectBasePath,
						flatAttachments,
						attachmentIndex,
						attachmentsReady,
					})
					// 这里主要服务于资源同一性和缓存 key。无法唯一确认时保留原值，
					// 让调用侧不命中，而不是错误地把它折叠到当前画布。
					return resolved ?? path
				}
				return resolveWorkspaceAbsoluteApiPath(
					path,
					"design.errors.designResourcePathUnresolved",
				)
			},
			[
				attachmentIndex,
				attachmentsReady,
				designProjectBasePath,
				flatAttachments,
				resolveWorkspaceAbsoluteApiPath,
			],
		)

	const resolveResourcePathCandidates: NonNullable<
		CanvasDesignMethods["resolveResourcePathCandidates"]
	> = useCallback(
		(path: string) => {
			const ctx = { designProjectBasePath, flatAttachments, attachmentIndex }
			const candidates = new Set<string>()
			const addCandidate = (candidate?: string) => {
				const normalized = candidate?.trim().replace(/\\/g, "/")
				if (normalized) candidates.add(normalized)
			}

			addCandidate(path)
			const operationResolution = resolveDesignPathForOperation(path, {
				...ctx,
				attachmentsReady,
			})
			if (operationResolution.status === "found") {
				addCandidate(operationResolution.resolvedPath)
				addCandidate(
					toDesignDslPathFromWorkspacePath(operationResolution.resolvedPath, ctx),
				)
				return Array.from(candidates)
			}
			if (isLegacyBareDesignResourcePath(path)) {
				return Array.from(candidates)
			}

			const workspacePath = toWorkspaceRelativePath(path, ctx)
			addCandidate(workspacePath)
			addCandidate(toDesignDslPathFromWorkspacePath(workspacePath, ctx))

			toWorkspaceRelativeCandidates(path, ctx).forEach((candidate, index) => {
				if (index === 0 || isCurrentCanvasResourcePath(candidate, ctx)) {
					addCandidate(candidate)
					addCandidate(toDesignDslPathFromWorkspacePath(candidate, ctx))
				}
			})

			return Array.from(candidates)
		},
		[attachmentIndex, attachmentsReady, designProjectBasePath, flatAttachments],
	)
	const normalizeResourcePathForStorage: NonNullable<
		CanvasDesignMethods["normalizeResourcePathForStorage"]
	> = useCallback(
		(path) =>
			toDesignDslPathFromWorkspacePath(path, {
				designProjectBasePath,
			}),
		[designProjectBasePath],
	)

	const getVirtualResourceScope = useCallback(() => {
		return [selectedWorkspace?.id, projectId].filter(Boolean).join("/")
	}, [projectId, selectedWorkspace?.id])

	const identifyImageMark = useCallback(
		async (params: IdentifyImageMarkRequest) => {
			// 标记识别使用 private 上传后的独立存储地址，不走工作区 API 路径转换。
			return SuperMagicApi.identifyImageMark({
				...params,
				project_id: params.project_id || projectId,
			})
		},
		[projectId],
	)

	const removeBackground = useCallback(
		async (params: RemoveBackgroundRequest) => {
			if (!projectId) {
				throw new Error(t("design.errors.projectIdNotExistsForGenerate"))
			}
			const imageId = params.image_id
			const filePath = params.file_path
			if (!imageId || !filePath) {
				throw new Error(t("design.errors.removeBackgroundParamsIncomplete"))
			}

			let fileDirWithSlash: string | undefined
			if (params.file_dir) {
				fileDirWithSlash = resolveWorkspaceAbsoluteApiPath(
					params.file_dir,
					"design.errors.removeBackgroundImagesDirUnresolved",
					{
						ensureTrailingSlash: true,
					},
				)
			} else {
				fileDirWithSlash = await resolveDesignImagesFileDirWithSlash({
					projectId,
					currentFile,
					flatAttachments,
					updateAttachments,
				})
			}
			if (fileDirWithSlash) {
				fileDirWithSlash = resolveWorkspaceAbsoluteApiPath(
					fileDirWithSlash,
					"design.errors.removeBackgroundImagesDirUnresolved",
					{ ensureTrailingSlash: true },
				)
			}
			if (!fileDirWithSlash) {
				throw new Error(t("design.errors.removeBackgroundImagesDirUnresolved"))
			}

			const filePathWithSlash = resolveWorkspaceAbsoluteApiPath(
				filePath,
				"design.errors.removeBackgroundImagesDirUnresolved",
			)

			const result = await SuperMagicApi.removeBackground({
				project_id: params.project_id || projectId,
				image_id: imageId,
				file_dir: fileDirWithSlash,
				file_path: filePathWithSlash,
				size: params.size,
				reference_image_options: buildReferenceImageOptions({
					filePath: filePathWithSlash,
					crop: getReferenceImageCrop({
						filePath,
						referenceImageOptions: params.reference_image_options,
					}),
				}),
			})
			return toCanvasGenerateHightImageResponse(result as ApiGenerateHightImageResponse)
		},
		[
			projectId,
			currentFile,
			flatAttachments,
			updateAttachments,
			resolveWorkspaceAbsoluteApiPath,
			t,
		],
	)

	const eraser = useCallback(
		async (params: EraserRequest) => {
			if (!projectId) {
				throw new Error(t("design.errors.eraserProjectIdNotExists"))
			}
			const imageId = params.image_id
			const filePath = params.file_path
			const markPath = params.mark_path
			if (!imageId || !filePath || !markPath) {
				throw new Error(t("design.errors.eraserParamsIncomplete"))
			}

			let fileDirWithSlash: string | undefined
			if (params.file_dir) {
				fileDirWithSlash = resolveWorkspaceAbsoluteApiPath(
					params.file_dir,
					"design.errors.eraserImagesDirUnresolved",
					{
						ensureTrailingSlash: true,
					},
				)
			} else {
				fileDirWithSlash = await resolveDesignImagesFileDirWithSlash({
					projectId,
					currentFile,
					flatAttachments,
					updateAttachments,
				})
			}
			if (fileDirWithSlash) {
				fileDirWithSlash = resolveWorkspaceAbsoluteApiPath(
					fileDirWithSlash,
					"design.errors.eraserImagesDirUnresolved",
					{ ensureTrailingSlash: true },
				)
			}
			if (!fileDirWithSlash) {
				throw new Error(t("design.errors.eraserImagesDirUnresolved"))
			}

			const filePathWithSlash = resolveWorkspaceAbsoluteApiPath(
				filePath,
				"design.errors.eraserImagesDirUnresolved",
			)
			const markPathWithSlash = normalizeRequestApiPath(
				markPath,
				"design.errors.eraserImagesDirUnresolved",
			)

			const result = await SuperMagicApi.eraser({
				project_id: params.project_id || projectId,
				image_id: imageId,
				file_dir: fileDirWithSlash,
				file_path: filePathWithSlash,
				mark_path: markPathWithSlash,
				size: params.size,
				reference_image_options: buildReferenceImageOptions({
					filePath: filePathWithSlash,
					crop: getReferenceImageCrop({
						filePath,
						referenceImageOptions: params.reference_image_options,
					}),
				}),
			})
			return toCanvasGenerateHightImageResponse(result as ApiGenerateHightImageResponse)
		},
		[
			projectId,
			currentFile,
			flatAttachments,
			updateAttachments,
			resolveWorkspaceAbsoluteApiPath,
			normalizeRequestApiPath,
			t,
		],
	)

	const expandImage = useCallback(
		async (params: GenerateExtendedImageRequest) => {
			if (!projectId) {
				throw new Error(t("design.errors.expandImageProjectIdNotExists"))
			}
			const imageId = params.image_id
			const filePath = params.file_path
			const canvasPath = params.canvas_path
			const maskPath = params.mask_path
			if (!imageId || !filePath || !canvasPath || !maskPath) {
				throw new Error(t("design.errors.expandImageParamsIncomplete"))
			}

			let fileDirWithSlash: string | undefined
			if (params.file_dir) {
				fileDirWithSlash = resolveWorkspaceAbsoluteApiPath(
					params.file_dir,
					"design.errors.expandImageImagesDirUnresolved",
					{
						ensureTrailingSlash: true,
					},
				)
			} else {
				fileDirWithSlash = await resolveDesignImagesFileDirWithSlash({
					projectId,
					currentFile,
					flatAttachments,
					updateAttachments,
				})
			}
			if (fileDirWithSlash) {
				fileDirWithSlash = resolveWorkspaceAbsoluteApiPath(
					fileDirWithSlash,
					"design.errors.expandImageImagesDirUnresolved",
					{ ensureTrailingSlash: true },
				)
			}
			if (!fileDirWithSlash) {
				throw new Error(t("design.errors.expandImageImagesDirUnresolved"))
			}

			const filePathWithSlash = resolveWorkspaceAbsoluteApiPath(
				filePath,
				"design.errors.expandImageImagesDirUnresolved",
			)
			const canvasPathWithSlash = normalizeRequestApiPath(
				canvasPath,
				"design.errors.expandImageImagesDirUnresolved",
			)
			const maskPathWithSlash = normalizeRequestApiPath(
				maskPath,
				"design.errors.expandImageImagesDirUnresolved",
			)

			const result = await SuperMagicApi.expandImage({
				project_id: params.project_id || projectId,
				image_id: imageId,
				file_dir: fileDirWithSlash,
				file_path: filePathWithSlash,
				canvas_path: canvasPathWithSlash,
				mask_path: maskPathWithSlash,
				size: params.size,
				reference_image_options: buildReferenceImageOptions({
					filePath: filePathWithSlash,
					crop: getReferenceImageCrop({
						filePath,
						referenceImageOptions: params.reference_image_options,
					}),
				}),
			})
			return toCanvasGenerateHightImageResponse(result as ApiGenerateHightImageResponse)
		},
		[
			projectId,
			currentFile,
			flatAttachments,
			updateAttachments,
			resolveWorkspaceAbsoluteApiPath,
			normalizeRequestApiPath,
			t,
		],
	)

	// 组合所有方法到 CanvasDesignMethods 接口
	const methods = useMemo<CanvasDesignMethods>(() => {
		return {
			getImageModelList,
			completeImagePrompt,
			completeTextContent,
			getVideoModelList,
			generateVideo,
			estimateVideoPoints,
			generateImage,
			generateImages,
			removeBackground,
			eraser,
			expandImage,
			generateHightImage: generateCanvasHightImage,
			getConvertHightConfig,
			getImageGenerationResult,
			getImageGenerationResults,
			getVideoGenerationResult,
			locateProjectFile,
			uploadFiles,
			getFileInfo,
			getFileResourceMeta,
			resolveAbsolutePath,
			resolveResourcePathCandidates,
			normalizeResourcePathForStorage,
			getVirtualResourceScope,
			getImageProcessCacheSignature: getPreviewFileUrlWatermarkSignature,
			addToConversation,
			downloadFiles,
			getStorage,
			saveStorage,
			getRootStorage,
			saveRootStorage,
			getDataTransferFileInfo,
			identifyImageMark,
			uploadPrivateFiles,
			confirmModal,
			clipboard: {
				write: clipboard.write,
				readText: navigator.clipboard?.readText
					? navigator.clipboard.readText.bind(navigator.clipboard)
					: undefined,
				read: navigator.clipboard?.read
					? navigator.clipboard.read.bind(navigator.clipboard)
					: undefined,
			},
		}
	}, [
		getImageModelList,
		completeImagePrompt,
		completeTextContent,
		getVideoModelList,
		generateVideo,
		estimateVideoPoints,
		generateImage,
		generateImages,
		removeBackground,
		eraser,
		expandImage,
		generateCanvasHightImage,
		getConvertHightConfig,
		getImageGenerationResult,
		getImageGenerationResults,
		getVideoGenerationResult,
		locateProjectFile,
		uploadFiles,
		getFileInfo,
		getFileResourceMeta,
		resolveAbsolutePath,
		resolveResourcePathCandidates,
		normalizeResourcePathForStorage,
		getVirtualResourceScope,
		addToConversation,
		downloadFiles,
		getStorage,
		saveStorage,
		getRootStorage,
		saveRootStorage,
		getDataTransferFileInfo,
		identifyImageMark,
		uploadPrivateFiles,
		confirmModal,
	])

	return methods
}
