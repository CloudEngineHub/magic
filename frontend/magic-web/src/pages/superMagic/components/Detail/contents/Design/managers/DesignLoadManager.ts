import {
	findMagicProjectJsFile,
	parseMagicProjectJsContentWithDiagnostics,
	resolveDesignDirectoryNameFromAttachments,
	resolveDesignProjectBasePathFromAttachments,
	normalizeDesignDataPathsAfterLoad,
	resolveActualDesignCurrentFile,
} from "../utils/utils"
import { hashDesignDataComparable } from "../utils/designContentHash"
import { SuperMagicApi } from "@/apis"
import { logger as Logger } from "@/utils/log"
import { hydrateDesignDataDetails } from "../utils/elementDetailsIo"
import type { DesignProjectStateBag, DesignProjectManagerOptions } from "./types"

const logger = Logger.createLogger("canvas-design-load")

interface DesignLoadRequest {
	identityKey: string
	options: DesignProjectManagerOptions
	currentFile: { id: string; name: string }
}

interface PendingDesignLoad {
	identityKey: string
	promise: Promise<boolean>
}

export class DesignLoadManager {
	private stateBag: DesignProjectStateBag
	private options: DesignProjectManagerOptions

	private pendingLoad: PendingDesignLoad | null = null
	private lastLoadedIdentityKey: string | null = null
	private currentProjectId: string | null = null

	constructor(stateBag: DesignProjectStateBag, options: DesignProjectManagerOptions) {
		this.stateBag = stateBag
		this.options = options
	}

	updateOptions(options: DesignProjectManagerOptions) {
		const previousIdentityKey = this.getCurrentLoadIdentity()
		this.options = options
		if (previousIdentityKey !== this.getCurrentLoadIdentity()) {
			this.lastLoadedIdentityKey = null
		}
	}

	async loadFromRemote(): Promise<boolean> {
		const request = this.createLoadRequest()
		if (!request) return false

		if (this.pendingLoad?.identityKey === request.identityKey) {
			return this.pendingLoad.promise
		}

		const pendingLoad: PendingDesignLoad = {
			identityKey: request.identityKey,
			promise: this.loadFromRemoteInternal(request),
		}
		this.pendingLoad = pendingLoad
		try {
			return await pendingLoad.promise
		} finally {
			if (this.pendingLoad === pendingLoad) {
				this.pendingLoad = null
			}
		}
	}

	getCurrentLoadIdentity(): string | null {
		return this.createLoadRequest()?.identityKey ?? null
	}

	isCurrentLoadIdentity(identityKey: string | null): boolean {
		return !!identityKey && this.getCurrentLoadIdentity() === identityKey
	}

	private createLoadRequest(): DesignLoadRequest | null {
		const {
			currentFile,
			attachments,
			flatAttachments,
			projectPath,
			projectId,
			attachmentsReady,
		} = this.options

		const actualCurrentFile = resolveActualDesignCurrentFile({
			currentFile,
			flatAttachments,
			attachments,
			projectPath,
		})

		if (
			!actualCurrentFile?.id ||
			!actualCurrentFile.name ||
			!attachments ||
			attachmentsReady === false
		) {
			return null
		}

		return {
			identityKey: JSON.stringify([projectId ?? null, actualCurrentFile.id]),
			options: this.options,
			currentFile: actualCurrentFile,
		}
	}

	private isCurrentLoadRequest(request: DesignLoadRequest): boolean {
		return this.createLoadRequest()?.identityKey === request.identityKey
	}

	private async loadFromRemoteInternal(request: DesignLoadRequest): Promise<boolean> {
		const {
			options: {
				attachments,
				flatAttachments,
				projectPath,
				projectId,
				allowEdit,
				isPlaybackMode,
				isShareRoute,
				isMobile,
				attachmentIndex,
			},
			currentFile: { id: actualCurrentFileId, name: actualCurrentFileName },
		} = request

		if (!attachments) return false

		const currentProjectId = projectId ?? null
		const hasProjectChanged =
			this.currentProjectId !== null && this.currentProjectId !== currentProjectId

		if (hasProjectChanged) {
			this.stateBag.setters.setIsReadOnly(
				!allowEdit || isPlaybackMode || isShareRoute || isMobile,
			)
		}

		this.currentProjectId = currentProjectId

		if (this.lastLoadedIdentityKey === request.identityKey) return true

		let didApplyDesignData = false
		try {
			this.stateBag.setters.setIsInitialLoading(true)

			const result = await findMagicProjectJsFile({
				attachments,
				currentFileId: actualCurrentFileId,
				currentFileName: actualCurrentFileName,
			})
			if (!this.isCurrentLoadRequest(request)) {
				return false
			}

			if (result?.fileId) {
				if (!result.content) {
					throw new Error("magic.project.js content is empty")
				}

				const parsed = parseMagicProjectJsContentWithDiagnostics(result.content)
				if (
					!parsed.data ||
					(parsed.canvasStatus !== "valid-empty" &&
						parsed.canvasStatus !== "valid-non-empty")
				) {
					throw new Error(`Unsafe magic.project.js canvas status: ${parsed.canvasStatus}`)
				}
				const parsedData = parsed.data
				this.stateBag.setters.setMagicProjectJsFileId(result.fileId)
				const directoryName = resolveDesignDirectoryNameFromAttachments({
					currentFile: { id: actualCurrentFileId, name: actualCurrentFileName },
					flatAttachments,
					attachments,
					projectPath,
				})
				if (directoryName && parsedData.name !== directoryName) {
					parsedData.name = directoryName
				}

				const dslBase = resolveDesignProjectBasePathFromAttachments({
					currentFile: {
						id: actualCurrentFileId,
						name: actualCurrentFileName,
					},
					flatAttachments,
					attachments,
				})
				if (dslBase) {
					normalizeDesignDataPathsAfterLoad(parsedData, dslBase, {
						flatAttachments,
						attachmentIndex,
					})
				}

				// v2：从 sidecar 回填重字段，让画布与生成编辑器拿到完整数据
				const elementDetailsProvenance = await hydrateDesignDataDetails(parsedData, {
					attachments,
					flatAttachments,
					mainFileId: result.fileId,
					projectId: projectId ?? undefined,
				})
				if (!this.isCurrentLoadRequest(request)) {
					return false
				}

				this.stateBag.setters.setElementDetailsProvenance?.(elementDetailsProvenance)
				this.stateBag.setters.setDesignData(parsedData)
				this.stateBag.setPrevDesignDataFingerprint(hashDesignDataComparable(parsedData))
				didApplyDesignData = true
				this.lastLoadedIdentityKey = request.identityKey

				if (!isShareRoute && didApplyDesignData) {
					try {
						const fileInfo = await SuperMagicApi.getFileInfo({
							file_id: result.fileId,
						})
						if (this.isCurrentLoadRequest(request) && fileInfo?.version !== undefined) {
							this.stateBag.setMagicProjectJsVersion(fileInfo.version)
						}
					} catch {
						// ignore
					}
				}
			}
		} catch (error) {
			logger.error({
				eventKey: "canvas_design_remote_load_failed",
				errorKind: "load",
				error,
				message: "Failed to load canvas design data from remote",
				context: {
					projectId: projectId ?? null,
					currentFileId: actualCurrentFileId ?? null,
				},
			})
		}
		return didApplyDesignData
	}

	async resetAndReload(): Promise<boolean> {
		this.lastLoadedIdentityKey = null
		return this.loadFromRemote()
	}
}
