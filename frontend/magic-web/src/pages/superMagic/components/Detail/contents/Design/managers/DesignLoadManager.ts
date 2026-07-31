import {
	findMagicProjectJsFile,
	parseMagicProjectJsContent,
	resolveDesignDirectoryNameFromAttachments,
	resolveDesignProjectBasePathFromAttachments,
	normalizeDesignDataPathsAfterLoad,
	resolveActualDesignCurrentFile,
} from "../utils/utils"
import { hashDesignDataComparable } from "../utils/designContentHash"
import { SuperMagicApi } from "@/apis"
import { hydrateDesignDataDetails } from "../utils/elementDetailsIo"
import type { DesignProjectStateBag, DesignProjectManagerOptions } from "./types"

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

	async loadFromRemote(): Promise<void> {
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
			return
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

		if (this.isLoading) return
		if (this.lastLoadedFileId === actualCurrentFileId && !hasProjectChanged) return

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
					const parsedData = parseMagicProjectJsContent(result.content)
					if (parsedData) {
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
								attachmentIndex: this.options.attachmentIndex,
							})
						}

						// v2：从 sidecar 回填重字段，让画布与生成编辑器拿到完整数据
						const elementDetailsProvenance = await hydrateDesignDataDetails(
							parsedData,
							{
								attachments,
								flatAttachments,
								mainFileId: result.fileId,
								projectId: projectId ?? undefined,
							},
						)

						this.stateBag.setters.setElementDetailsProvenance?.(
							elementDetailsProvenance,
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
	}

	async resetAndReload(): Promise<void> {
		this.lastLoadedFileId = null
		await this.loadFromRemote()
	}
}
