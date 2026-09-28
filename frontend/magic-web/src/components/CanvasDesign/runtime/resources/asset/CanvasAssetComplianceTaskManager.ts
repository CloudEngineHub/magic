import type {
	CanvasAssetComplianceState,
	CanvasAssetResourceInfo,
} from "../../../public/magic-types"
import type { Canvas } from "../../core/Canvas"
import type {
	CanvasAssetCompliancePollingOptions,
	CanvasAssetCompliancePollingManager,
} from "./CanvasAssetCompliancePollingManager"
import type { CanvasAssetResourceManager } from "./CanvasAssetResourceManager"
import {
	collectAssetBoundComplianceResumeIds,
	collectDocumentComplianceResumeTargets,
} from "./collectDocumentComplianceResumeTargets"
import {
	applyWorkspaceMediaComplianceState,
	writeMediaComplianceState,
} from "./mediaComplianceContent"

export interface MediaCompliancePersistTarget {
	elementId: string
	contentId: string
	sourcePath: string
}

export interface ComplianceWatchOptions {
	persistTargets?: MediaCompliancePersistTarget[]
	onUpdate?: (state: CanvasAssetComplianceState) => void
	onSettled?: (state: CanvasAssetComplianceState) => void
	onError?: (error: unknown) => void
}

export interface CanvasAssetComplianceTaskHost {
	assetCompliancePollingManager: CanvasAssetCompliancePollingManager
	assetResourceManager: CanvasAssetResourceManager
	elementManager: Canvas["elementManager"]
	permissionManager?: Canvas["permissionManager"]
	refreshMediaComplianceFailedTags?: () => void
}

export interface StartWorkspaceFileComplianceParams {
	path: string
	name: string
	persistTarget: MediaCompliancePersistTarget
	startWorkspaceMediaCompliance: (params: {
		path: string
		name: string
	}) => Promise<CanvasAssetResourceInfo>
}

/**
 * 统一编排素材合规：发起 create、写 DSL、轮询 compliance、文档刷新后恢复。
 * UI 层只负责触发与 toast，不直接 setInterval 或拼 API 流程。
 */
export class CanvasAssetComplianceTaskManager {
	private readonly activeLibraryWatchIds = new Set<string>()

	constructor(private readonly host: CanvasAssetComplianceTaskHost) {}

	public watchCheck(checkId: string, options: ComplianceWatchOptions = {}): () => void {
		const normalizedId = checkId.trim()
		if (!normalizedId) return () => undefined

		const persistTargets = options.persistTargets ?? []
		const canPersist = this.canPersistToDocument()
		const pollingOptions: CanvasAssetCompliancePollingOptions = {
			onUpdate: (state) => {
				if (canPersist) {
					this.persistState(persistTargets, state, normalizedId)
				}
				options.onUpdate?.(state)
				this.host.refreshMediaComplianceFailedTags?.()
			},
			onSettled: (state) => {
				if (canPersist) {
					this.persistState(persistTargets, state, normalizedId)
				}
				options.onSettled?.(state)
				this.host.refreshMediaComplianceFailedTags?.()
			},
			onError: options.onError,
		}

		return this.host.assetCompliancePollingManager.start(normalizedId, pollingOptions)
	}

	public async startWorkspaceFileCompliance(
		params: StartWorkspaceFileComplianceParams,
		watchOptions: Omit<ComplianceWatchOptions, "persistTargets"> = {},
	): Promise<string | null> {
		const created = await params.startWorkspaceMediaCompliance({
			path: params.path,
			name: params.name,
		})
		const checkId = created.assetId.trim()
		if (!checkId) return null

		if (this.canPersistToDocument()) {
			writeMediaComplianceState(this.host as Canvas, {
				elementId: params.persistTarget.elementId,
				contentId: params.persistTarget.contentId,
				sourcePath: params.persistTarget.sourcePath,
				complianceStatus: "PROCESSING",
				complianceCheckId: checkId,
			})
		}

		this.watchCheck(checkId, {
			persistTargets: [params.persistTarget],
			...watchOptions,
		})
		return checkId
	}

	public resumeDocumentCompliancePolling(): void {
		for (const group of collectDocumentComplianceResumeTargets(this.host)) {
			this.watchCheck(group.checkId, {
				persistTargets: group.targets,
			})
		}

		for (const assetId of collectAssetBoundComplianceResumeIds(this.host)) {
			this.watchCheck(assetId, {
				onSettled: () => {
					void this.host.assetResourceManager
						.refreshResources([assetId])
						.then(() => {
							this.host.refreshMediaComplianceFailedTags?.()
						})
						.catch(() => undefined)
				},
			})
		}
		this.host.refreshMediaComplianceFailedTags?.()
	}

	public watchLibraryComplianceChecks(
		assetIds: readonly string[],
		onSettled?: (state: CanvasAssetComplianceState) => void,
	): () => void {
		const normalizedIds = Array.from(
			new Set(assetIds.map((assetId) => assetId.trim()).filter(Boolean)),
		)
		const unsubscribers = normalizedIds.map((assetId) => {
			this.activeLibraryWatchIds.add(assetId)
			return this.watchCheck(assetId, {
				onSettled: (state) => {
					this.activeLibraryWatchIds.delete(assetId)
					onSettled?.(state)
				},
			})
		})

		return () => {
			for (const unsubscribe of unsubscribers) unsubscribe()
			for (const assetId of normalizedIds) this.activeLibraryWatchIds.delete(assetId)
		}
	}

	public resumeLibraryComplianceChecks(
		assetIds: readonly string[],
		onSettled?: (state: CanvasAssetComplianceState) => void,
	): () => void {
		const pendingIds = assetIds
			.map((assetId) => assetId.trim())
			.filter((assetId) => assetId.length > 0)
			.filter(
				(assetId) =>
					!this.activeLibraryWatchIds.has(assetId) &&
					this.host.assetCompliancePollingManager.getState(assetId)?.status !== "PASS" &&
					this.host.assetCompliancePollingManager.getState(assetId)?.status !== "FAILED",
			)

		if (pendingIds.length === 0) return () => undefined
		return this.watchLibraryComplianceChecks(pendingIds, onSettled)
	}

	private canPersistToDocument(): boolean {
		return this.host.permissionManager?.can("document.write") ?? false
	}

	private persistState(
		targets: MediaCompliancePersistTarget[],
		state: CanvasAssetComplianceState,
		checkId: string,
	): void {
		for (const target of targets) {
			applyWorkspaceMediaComplianceState(this.host as Canvas, {
				elementId: target.elementId,
				contentId: target.contentId,
				sourcePath: target.sourcePath,
				complianceStatus: state.status,
				complianceFailedReason: state.failedReason,
				complianceCheckId: checkId,
			})
		}
	}
}

export function resumeDocumentAssetCompliancePolling(canvas: Canvas): void {
	canvas.assetComplianceTaskManager.resumeDocumentCompliancePolling()
}
