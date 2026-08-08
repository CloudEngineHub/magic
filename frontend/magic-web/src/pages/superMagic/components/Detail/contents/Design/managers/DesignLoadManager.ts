import {
	findMagicProjectJsFile,
	resolveDesignDirectoryNameFromAttachments,
	resolveDesignProjectBasePathFromAttachments,
	resolveActualDesignCurrentFile,
} from "../utils/utils"
import { hashDesignDataComparable } from "../utils/designContentHash"
import { SuperMagicApi } from "@/apis"
import type {
	DesignProjectStateBag,
	DesignProjectManagerOptions,
	PendingDesignUpgrade,
} from "./types"
import { loadDesignDataToRuntime } from "../utils/designDataLoader"
import { MAGIC_PROJECT_VERSION_V3 } from "../utils/magicProjectCompression"

export interface DesignLoadResult {
	pendingUpgrade: PendingDesignUpgrade | null
}

export class DesignLoadManager {
	private stateBag: DesignProjectStateBag
	private options: DesignProjectManagerOptions

	private isLoading = false
	private lastLoadedFileId: string | null = null
	private currentProjectId: string | null = null

	constructor(stateBag: DesignProjectStateBag, options: DesignProjectManagerOptions) {
		this.stateBag = stateBag
		this.options = options
	}

	updateOptions(options: DesignProjectManagerOptions) {
		this.options = options
	}

	async loadFromRemote(): Promise<DesignLoadResult | undefined> {
		const {
			currentFile,
			attachments,
			flatAttachments,
			projectPath,
			projectId,
			allowEdit,
			isPlaybackMode,
			isShareRoute,
			isMobile,
		} = this.options

		const actualCurrentFile = resolveActualDesignCurrentFile({
			currentFile,
			flatAttachments,
			attachments,
			projectPath,
		})
		const actualCurrentFileId = actualCurrentFile?.id
		const actualCurrentFileName = actualCurrentFile?.name

		if (!actualCurrentFileId || !actualCurrentFileName || !attachments) {
			this.stateBag.setters.setIsInitialLoading(false)
			return { pendingUpgrade: null }
		}

		const currentProjectId = projectId ?? null
		const hasProjectChanged =
			this.currentProjectId !== null && this.currentProjectId !== currentProjectId

		if (hasProjectChanged) {
			this.lastLoadedFileId = null
			this.stateBag.setters.setIsReadOnly(
				!allowEdit || isPlaybackMode || isShareRoute || isMobile,
			)
		}

		this.currentProjectId = currentProjectId

		if (this.isLoading) return undefined
		if (this.lastLoadedFileId === actualCurrentFileId && !hasProjectChanged) return undefined

		let pendingUpgrade: PendingDesignUpgrade | null = null

		try {
			this.isLoading = true
			this.stateBag.setters.setIsInitialLoading(true)

			const result = await findMagicProjectJsFile({
				attachments,
				currentFileId: actualCurrentFileId,
				currentFileName: actualCurrentFileName,
			})

			if (result?.fileId) {
				this.stateBag.setters.setMagicProjectJsFileId(result.fileId)

				let didApplyDesignData = false
				if (result.content) {
					const directoryName = resolveDesignDirectoryNameFromAttachments({
						currentFile: { id: actualCurrentFileId, name: actualCurrentFileName },
						flatAttachments,
						attachments,
						projectPath,
					})
					const dslBase = resolveDesignProjectBasePathFromAttachments({
						currentFile: {
							id: actualCurrentFileId,
							name: actualCurrentFileName,
						},
						flatAttachments,
						attachments,
					})
					const loaded = await loadDesignDataToRuntime({
						content: result.content,
						nameOverride: directoryName,
						elementDetailsContext: {
							attachments,
							flatAttachments,
							mainFileId: result.fileId,
							projectId: projectId ?? undefined,
						},
						pathContext: {
							projectBasePath: dslBase,
							flatAttachments,
							attachmentIndex: this.options.attachmentIndex,
						},
					})
					if (loaded) {
						const parsedData = loaded.data
						if (loaded.needsPersist) {
							pendingUpgrade = {
								fileId: result.fileId,
								sourceVersion: loaded.sourceVersion,
								targetVersion: MAGIC_PROJECT_VERSION_V3,
							}
						}
						this.stateBag.setters.setElementDetailsProvenance?.(
							loaded.elementDetailsProvenance ?? {},
						)
						this.stateBag.setters.setDesignData(parsedData)
						this.stateBag.setPrevDesignDataFingerprint(
							hashDesignDataComparable(parsedData),
						)
						didApplyDesignData = true
						this.lastLoadedFileId = actualCurrentFileId
					}
				}

				if (!isShareRoute && didApplyDesignData) {
					try {
						const fileInfo = await SuperMagicApi.getFileInfo({
							file_id: result.fileId,
						})
						if (fileInfo?.version !== undefined) {
							this.stateBag.setMagicProjectJsVersion(fileInfo.version)
						}
					} catch {
						// ignore
					}
				}
			}
		} catch {
			// ignore
		} finally {
			this.isLoading = false
			this.stateBag.setters.setIsInitialLoading(false)
		}

		return { pendingUpgrade }
	}

	async resetAndReload(): Promise<DesignLoadResult | undefined> {
		this.lastLoadedFileId = null
		return this.loadFromRemote()
	}
}
