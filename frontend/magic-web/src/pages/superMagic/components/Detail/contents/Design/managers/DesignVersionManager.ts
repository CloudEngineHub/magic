import magicToast from "@/components/base/MagicToaster/utils"
import { SuperMagicApi } from "@/apis"
import type { FileHistoryVersion } from "@/pages/superMagic/pages/Workspace/types"
import {
	loadMagicProjectJsContent,
	resolveDesignProjectBasePathFromAttachments,
} from "../utils/utils"
import { hashDesignDataComparable } from "../utils/designContentHash"
import { getHydratedElementDetailsProvenance } from "../utils/elementDetailsIo"
import { type DesignProjectStateBag, type DesignProjectManagerOptions } from "./types"
import type { DesignData } from "../types"
import type { DesignSaveManager } from "./DesignSaveManager"
import {
	DesignLoadError,
	loadDesignDataToRuntime,
	type LoadDesignDataToRuntimeResult,
} from "../utils/designDataLoader"
import { MAGIC_PROJECT_VERSION_V3 } from "../utils/magicProjectCompression"

export interface DesignVersionLoadResult {
	data: DesignData | null
	version: number | null
	loadResult?: LoadDesignDataToRuntimeResult
}

export class DesignVersionManager {
	private stateBag: DesignProjectStateBag
	private options: DesignProjectManagerOptions
	private saveManager: DesignSaveManager

	private getFileVersionsList: () => FileHistoryVersion[]
	private getFileVersion: () => number | undefined

	constructor(
		stateBag: DesignProjectStateBag,
		options: DesignProjectManagerOptions,
		saveManager: DesignSaveManager,
		getFileVersionsList: () => FileHistoryVersion[],
		getFileVersion: () => number | undefined,
	) {
		this.stateBag = stateBag
		this.options = options
		this.saveManager = saveManager
		this.getFileVersionsList = getFileVersionsList
		this.getFileVersion = getFileVersion
	}

	updateOptions(options: DesignProjectManagerOptions) {
		this.options = options
	}

	async loadWithVersion(version: number): Promise<DesignData | null> {
		const magicProjectJsFileId = this.stateBag.getMagicProjectJsFileId()
		if (!magicProjectJsFileId) return null

		let content: string
		try {
			content = await loadMagicProjectJsContent(magicProjectJsFileId, {
				file_versions: { [magicProjectJsFileId]: version },
			})
		} catch (error) {
			throw new DesignLoadError({
				kind: "invalid-envelope",
				stage: "parse-envelope",
				message: error instanceof Error ? error.message : String(error),
				fileId: magicProjectJsFileId,
			})
		}
		const dslBase = resolveDesignProjectBasePathFromAttachments(this.options)
		const loaded = await loadDesignDataToRuntime({
			content,
			sidecarMode: "none",
			fileId: magicProjectJsFileId,
			pathContext: {
				projectBasePath: dslBase,
				flatAttachments: this.options.flatAttachments,
				attachmentIndex: this.options.attachmentIndex,
			},
		})
		return loaded.data
	}

	async loadLatest(): Promise<DesignVersionLoadResult> {
		const magicProjectJsFileId = this.stateBag.getMagicProjectJsFileId()
		if (!magicProjectJsFileId) return { data: null, version: null }

		let content: string
		try {
			content = await loadMagicProjectJsContent(magicProjectJsFileId)
		} catch (error) {
			throw new DesignLoadError({
				kind: "invalid-envelope",
				stage: "parse-envelope",
				message: error instanceof Error ? error.message : String(error),
				fileId: magicProjectJsFileId,
			})
		}
		const dslBase = resolveDesignProjectBasePathFromAttachments(this.options)
		const loaded = await loadDesignDataToRuntime({
			content,
			elementDetailsContext: {
				attachments: this.options.attachments,
				flatAttachments: this.options.flatAttachments,
				mainFileId: magicProjectJsFileId,
				projectId: this.options.projectId,
			},
			pathContext: {
				projectBasePath: dslBase,
				flatAttachments: this.options.flatAttachments,
				attachmentIndex: this.options.attachmentIndex,
			},
			fileId: magicProjectJsFileId,
		})
		const data = loaded.data

		let version: number | null = null
		if (!this.options.isShareRoute) {
			try {
				const fileInfo = await SuperMagicApi.getFileInfo({
					file_id: magicProjectJsFileId,
				})
				if (fileInfo?.version !== undefined) {
					version = fileInfo.version
				}
			} catch {
				// ignore
			}
		}

		return { data, version, loadResult: loaded }
	}

	async fetchFileVersions(): Promise<FileHistoryVersion[]> {
		const magicProjectJsFileId = this.stateBag.getMagicProjectJsFileId()
		if (this.options.isShareRoute || !magicProjectJsFileId) return []

		try {
			const res = await SuperMagicApi.getFileHistoryVersions({
				file_id: magicProjectJsFileId,
				page_size: 10,
			})
			const list = res?.list ?? []
			this.stateBag.setters.setFileVersionsList(list)
			return list
		} catch {
			return []
		}
	}

	applyVersionData(parsedDesignData: DesignData, isViewingHistory: boolean): void {
		this.saveManager.cancelAutoSave()
		this.saveManager.clearRemoteConflict()
		this.stateBag.setters.setConflictState(null)
		this.stateBag.setters.setIsSaving(false)
		this.stateBag.setters.setElementDetailsProvenance?.(
			getHydratedElementDetailsProvenance(parsedDesignData) ?? {},
		)
		this.stateBag.setters.setDesignData(parsedDesignData)
		if (isViewingHistory) {
			this.stateBag.setters.setPendingDesignUpgrade?.(null)
			this.stateBag.setters.setDesignLoadIssue?.(undefined)
			this.stateBag.setters.setSidecarStatus?.("skipped-history")
		}
		this.stateBag.setPrevDesignDataFingerprint(hashDesignDataComparable(parsedDesignData))
		this.stateBag.setters.setIsReadOnly(
			!this.options.allowEdit ||
				this.options.isPlaybackMode ||
				isViewingHistory ||
				this.options.isShareRoute ||
				this.options.isMobile,
		)
		this.options.onVersionChange?.(parsedDesignData, isViewingHistory)
	}

	async handleChangeFileVersion(version: number, isNewestVersionTarget: boolean): Promise<void> {
		const magicProjectJsFileId = this.stateBag.getMagicProjectJsFileId()
		if (!magicProjectJsFileId) return

		const fileVersion = this.getFileVersion()
		if (fileVersion === version && !isNewestVersionTarget) return
		if (!fileVersion && isNewestVersionTarget) return

		try {
			let parsedDesignData: DesignData | null
			let latestVersion: number | null = null
			if (isNewestVersionTarget) {
				const result = await this.loadLatest()
				parsedDesignData = result.data
				latestVersion = result.version
				this.stateBag.setters.setDesignLoadIssue?.(result.loadResult?.issue)
				this.stateBag.setters.setSidecarStatus?.(
					result.loadResult?.sidecarStatus ?? "missing",
				)
				if (result.loadResult?.needsPersist) {
					this.stateBag.setters.setPendingDesignUpgrade?.({
						reason: "legacy-dsl",
						fileId: magicProjectJsFileId,
						sourceVersion: result.loadResult.sourceVersion,
						targetVersion: MAGIC_PROJECT_VERSION_V3,
						createdAt: Date.now(),
					})
				}
			} else {
				parsedDesignData = await this.loadWithVersion(version)
			}

			if (parsedDesignData) {
				this.stateBag.setters.setFileVersion(isNewestVersionTarget ? undefined : version)
				this.applyVersionData(parsedDesignData, !isNewestVersionTarget)
				if (isNewestVersionTarget && latestVersion !== null) {
					this.stateBag.setMagicProjectJsVersion(latestVersion)
				}
			}
		} catch (error) {
			if (error instanceof DesignLoadError) {
				this.stateBag.setters.setDesignLoadIssue?.(error.issue)
			}
		}
	}

	async handleReturnLatest(): Promise<void> {
		const list = this.getFileVersionsList()
		if (list?.length > 0) {
			await this.handleChangeFileVersion(list[0].version, true)
		} else {
			this.stateBag.setters.setFileVersion(undefined)
		}
	}

	async handleVersionRollback(version: number | undefined): Promise<void> {
		const magicProjectJsFileId = this.stateBag.getMagicProjectJsFileId()
		if (this.options.isShareRoute || !magicProjectJsFileId || !version) return

		try {
			const res = await SuperMagicApi.rollbackFileVersion({
				file_id: magicProjectJsFileId,
				version,
			})
			if (res) {
				await this.fetchFileVersions()
				this.stateBag.setters.setFileVersion(undefined)
				const { data, version: latestVersion, loadResult } = await this.loadLatest()
				this.stateBag.setters.setDesignLoadIssue?.(loadResult?.issue)
				this.stateBag.setters.setSidecarStatus?.(loadResult?.sidecarStatus ?? "missing")
				if (data) {
					this.applyVersionData(data, false)
					if (latestVersion !== null) {
						this.stateBag.setMagicProjectJsVersion(latestVersion)
					}
				}
				const t = this.options.getT?.() ?? ((k: string) => k)
				magicToast.success(t("common.rollbackSuccess"))
			}
		} catch {
			const t = this.options.getT?.() ?? ((k: string) => k)
			magicToast.error(t("design.errors.rollbackFailed"))
		}
	}
}
