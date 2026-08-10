import type { PPTLoggerService } from "../services"
import { ProjectStateRepository } from "@/models/config/repositories/SuperProjectStateRepository"
import { WorkspaceStateCache } from "@/pages/superMagic/utils/superMagicCache"
import { getSuperIdState } from "@/pages/superMagic/utils/query"
import { userStore } from "@/models/user"

export interface PPTActiveIndexCacheConfig {
	organizationCode?: string
	selectedProjectId?: string
	mainFileId?: string
}

/**
 * PPTActiveIndexCacheManager - Manages caching and restoration of PPT activeIndex
 * 管理 PPT activeIndex 的缓存和恢复
 *
 * Features:
 * - Debounced save (500ms) to avoid excessive writes
 * - Retry mechanism for projectId validation (max 10 retries, 100ms interval)
 * - Automatic cache restoration on initialization
 */
export class PPTActiveIndexCacheManager {
	private projectStateRepository: ProjectStateRepository
	private organizationCode?: string
	private selectedProjectId?: string
	private mainFileId?: string
	private logger: PPTLoggerService
	private debouncedSaveTimer?: NodeJS.Timeout
	private configGeneration = 0
	private disposed = false

	constructor(logger: PPTLoggerService, config: PPTActiveIndexCacheConfig) {
		this.logger = logger
		this.projectStateRepository = new ProjectStateRepository()
		this.updateConfig(config)

		this.logger.debug("PPTActiveIndexCacheManager initialized", {
			operation: "constructor",
			metadata: {
				hasOrganizationCode: !!config.organizationCode,
				hasSelectedProjectId: !!config.selectedProjectId,
				hasMainFileId: !!config.mainFileId,
			},
		})
	}

	/**
	 * Update cache configuration
	 * 更新缓存配置
	 */
	updateConfig(config: PPTActiveIndexCacheConfig): void {
		const configChanged =
			this.organizationCode !== config.organizationCode ||
			this.selectedProjectId !== config.selectedProjectId ||
			this.mainFileId !== config.mainFileId
		if (configChanged) {
			this.configGeneration++
			clearTimeout(this.debouncedSaveTimer)
			this.debouncedSaveTimer = undefined
		}

		this.organizationCode = config.organizationCode
		this.selectedProjectId = config.selectedProjectId
		this.mainFileId = config.mainFileId

		this.logger.debug("Cache config updated", {
			operation: "updateConfig",
			metadata: {
				hasOrganizationCode: !!config.organizationCode,
				hasSelectedProjectId: !!config.selectedProjectId,
				hasMainFileId: !!config.mainFileId,
			},
		})
	}

	/**
	 * Save activeIndex to cache with debouncing
	 * 防抖保存 activeIndex 到缓存
	 */
	saveActiveIndexDebounced(index: number): void {
		if (!this.canCache()) {
			this.logger.debug("Cannot cache - missing required config", {
				operation: "saveActiveIndexDebounced",
				metadata: {
					hasOrganizationCode: !!this.organizationCode,
					hasSelectedProjectId: !!this.selectedProjectId,
					hasMainFileId: !!this.mainFileId,
				},
			})
			return
		}

		if (this.disposed) {
			this.logger.warn("Cannot save - manager is disposed", {
				operation: "saveActiveIndexDebounced",
			})
			return
		}

		// Clear existing timer
		clearTimeout(this.debouncedSaveTimer)
		const configGeneration = this.configGeneration

		// Schedule save
		this.debouncedSaveTimer = setTimeout(() => {
			this.debouncedSaveTimer = undefined
			void this.saveActiveIndex(index, configGeneration)
		}, 500)
	}

	/**
	 * Save activeIndex immediately
	 * 立即保存 activeIndex
	 */
	private async saveActiveIndex(index: number, configGeneration: number): Promise<void> {
		if (this.disposed || configGeneration !== this.configGeneration || !this.canCache()) return
		const { organizationCode, selectedProjectId, mainFileId } = this
		if (!organizationCode || !selectedProjectId || !mainFileId) return

		try {
			this.logger.debug("Saving activeIndex to cache", {
				operation: "saveActiveIndex",
				metadata: { index, fileId: mainFileId },
			})

			const currentState = await this.projectStateRepository.getProjectState(
				organizationCode,
				selectedProjectId,
			)
			if (this.disposed || configGeneration !== this.configGeneration) return

			const pptActiveIndexMap = {
				...(currentState?.fileState?.pptActiveIndexMap || {}),
				[mainFileId]: index,
			}

			const fileState = {
				tabs: currentState?.fileState?.tabs || [],
				activeTabId: currentState?.fileState?.activeTabId,
				detailState: currentState?.fileState?.detailState,
				playbackTabExists: currentState?.fileState?.playbackTabExists,
				playbackTabActive: currentState?.fileState?.playbackTabActive,
				pptActiveIndexMap,
			}

			await this.projectStateRepository.updateFileState(
				organizationCode,
				selectedProjectId,
				fileState,
			)

			this.logger.debug("💾 PPT activeIndex saved to cache", {
				operation: "saveActiveIndex",
				metadata: { index, fileId: mainFileId },
			})
		} catch (error) {
			this.logger.error("Failed to save activeIndex", {
				operation: "saveActiveIndex",
				error,
			})
		}
	}

	/**
	 * Restore activeIndex from cache
	 * 从缓存恢复 activeIndex
	 *
	 * @returns The cached activeIndex, or null if not available
	 */
	async restoreActiveIndex(): Promise<number | null> {
		if (!this.canCache()) {
			this.logger.debug("Cannot restore - missing required config", {
				operation: "restoreActiveIndex",
			})
			return null
		}
		const configGeneration = this.configGeneration
		const { organizationCode, selectedProjectId, mainFileId } = this
		if (!organizationCode || !selectedProjectId || !mainFileId) return null

		try {
			this.logger.debug("Restoring activeIndex from cache", {
				operation: "restoreActiveIndex",
				metadata: {
					organizationCode,
					projectId: selectedProjectId,
					fileId: mainFileId,
				},
			})

			const cachedState = await this.projectStateRepository.getProjectState(
				organizationCode,
				selectedProjectId,
			)
			if (this.disposed || configGeneration !== this.configGeneration) return null

			const cachedIndex = cachedState?.fileState?.pptActiveIndexMap?.[mainFileId]

			if (typeof cachedIndex === "number" && cachedIndex >= 0) {
				// Validate projectId is ready before restoring
				const isValid = await this.waitForProjectIdReady(
					selectedProjectId,
					configGeneration,
				)

				if (isValid && configGeneration === this.configGeneration) {
					this.logger.debug("🔄 Restored cached activeIndex", {
						operation: "restoreActiveIndex",
						metadata: { index: cachedIndex, fileId: mainFileId },
					})
					return cachedIndex
				} else {
					this.logger.warn("ProjectId not ready, skipping cache restoration", {
						operation: "restoreActiveIndex",
					})
				}
			} else {
				this.logger.debug("No cached activeIndex found", {
					operation: "restoreActiveIndex",
					metadata: { cachedIndex },
				})
			}

			return null
		} catch (error) {
			this.logger.error("Failed to restore activeIndex", {
				operation: "restoreActiveIndex",
				error,
			})
			return null
		}
	}

	/**
	 * Wait for projectId to be ready with retry mechanism
	 * 等待 projectId 准备好（带重试机制）
	 *
	 * @param expectedProjectId The expected project ID to validate
	 * @returns true if projectId is ready and matches, false otherwise
	 */
	private async waitForProjectIdReady(
		expectedProjectId: string,
		configGeneration: number,
	): Promise<boolean> {
		return new Promise((resolve) => {
			let retryCount = 0
			const maxRetries = 10

			const check = () => {
				// Check if manager is disposed
				if (this.disposed || configGeneration !== this.configGeneration) {
					resolve(false)
					return
				}

				// Get projectId from various sources
				const workspaceState = WorkspaceStateCache.get(userStore.user.userInfo)
				const superIdState = getSuperIdState()
				const projectId =
					(window as any).project_id ||
					workspaceState?.projectId ||
					superIdState?.projectId

				// Validate projectId matches expected
				if (projectId === expectedProjectId) {
					this.logger.debug("ProjectId is ready", {
						operation: "waitForProjectIdReady",
						metadata: { projectId, retryCount },
					})
					resolve(true)
					return
				}

				// Retry if not exceeded max retries
				if (retryCount < maxRetries) {
					retryCount++
					this.logger.debug("ProjectId not ready, retrying...", {
						operation: "waitForProjectIdReady",
						metadata: {
							retryCount,
							maxRetries,
							currentProjectId: projectId,
							expectedProjectId,
						},
					})
					setTimeout(check, 100)
				} else {
					this.logger.warn(
						"ProjectId not ready after max retries, skipping cache restoration",
						{
							operation: "waitForProjectIdReady",
							metadata: {
								currentProjectId: projectId,
								expectedProjectId,
								retryCount,
							},
						},
					)
					resolve(false)
				}
			}

			// Start checking
			check()
		})
	}

	/**
	 * Check if caching is possible with current configuration
	 * 检查当前配置是否可以进行缓存
	 */
	private canCache(): boolean {
		return !!(this.organizationCode && this.selectedProjectId && this.mainFileId)
	}

	/**
	 * Dispose manager and cleanup resources
	 * 清理管理器资源
	 */
	dispose(): void {
		this.disposed = true
		this.configGeneration++
		clearTimeout(this.debouncedSaveTimer)
		this.debouncedSaveTimer = undefined
		this.logger.debug("PPTActiveIndexCacheManager disposed", {
			operation: "dispose",
		})
	}
}
