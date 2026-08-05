import { userStore } from "@/models/user"
import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"
import { platformKey } from "@/utils/storage"
import superMagicModeService from "./SuperMagicModeService"
import DefaultTopicModeStorageService from "./DefaultTopicModeStorageService"
import { resolveDefaultAgentSelection } from "./DefaultAgentSelectionService"

class ProjectTopicService {
	projectTopicModeMap: Map<string, TopicMode> = new Map()
	private projectTopicModeUserKey = ""

	constructor() {
		this.reloadProjectTopicModeMap()
	}

	/**
	 * 获取全局主题模式本地存储键
	 * @returns
	 */
	globalTopicModeLocaleStorageKey() {
		const organizationCode = userStore.user.organizationCode
		const userId = userStore.user.userInfo?.user_id
		return platformKey(`super_magic/default_topic_mode/${organizationCode}/${userId}`)
	}

	projectTopicModeLocaleStorageKey() {
		const organizationCode = userStore.user.organizationCode
		const userId = userStore.user.userInfo?.user_id
		return platformKey(`super_magic/default_project_topic_mode/${organizationCode}/${userId}`)
	}

	private getUserKey() {
		const organizationCode = userStore.user.organizationCode || "unknown"
		const userId = userStore.user.userInfo?.user_id || "legacy"
		return `${organizationCode}/${userId}`
	}

	/**
	 * 生成全局主题模式本地存储键
	 * @param workspaceId
	 * @param projectId
	 * @returns
	 */
	genProjectTopicModeCacheKey(workspaceId: string, projectId: string) {
		return `${workspaceId}/${projectId}`
	}

	isTopicModeValid(mode: TopicMode, agentCode?: string | null) {
		if (!mode) return false
		return superMagicModeService.isModeValid(mode, agentCode)
	}

	/**
	 * 获取全局主题模式
	 * @returns
	 */
	getGlobalTopicMode(): TopicMode | undefined {
		const userKey = this.getUserKey()
		const storedMode = DefaultTopicModeStorageService.getStoredMode({
			userKey,
		})
		if (storedMode) return storedMode

		return resolveDefaultAgentSelection().modeIdentifier as TopicMode
	}

	/**
	 * 获取未经可用性校验的全局主题模式，仅用于区分用户选择与系统回退。
	 */
	getRawGlobalTopicMode(): TopicMode | undefined {
		return DefaultTopicModeStorageService.getRawStoredMode({
			userKey: this.getUserKey(),
		})
	}

	/**
	 * 设置全局主题模式
	 * @param mode
	 */
	setGlobalTopicMode(mode: TopicMode | undefined) {
		if (!mode) return
		const userKey = this.getUserKey()
		DefaultTopicModeStorageService.setMode({
			userKey,
			mode,
		})
	}

	/**
	 * 获取项目默认主题模式
	 * @param workspaceId
	 * @param projectId
	 * @returns
	 */
	getProjectDefaultTopicMode(workspaceId: string, projectId: string) {
		this.ensureCurrentUserProjectModes()
		const key = this.genProjectTopicModeCacheKey(workspaceId, projectId)
		const value = this.projectTopicModeMap.get(key)

		if (value && this.isTopicModeValid(value)) {
			return value
		}

		return this.getGlobalTopicMode()
	}

	/**
	 * 设置项目默认主题模式
	 * @param workspaceId
	 * @param projectId
	 * @param value
	 */
	setProjectDefaultTopicMode(
		workspaceId: string,
		projectId: string,
		value: TopicMode | undefined,
	) {
		if (value) {
			this.ensureCurrentUserProjectModes()
			const key = this.genProjectTopicModeCacheKey(workspaceId, projectId)

			this.projectTopicModeMap.set(key, value)
			DefaultTopicModeStorageService.setProjects(
				this.getUserKey(),
				Object.fromEntries(this.projectTopicModeMap.entries()),
			)
		}
	}

	private getProjectBucket() {
		return DefaultTopicModeStorageService.getProjects(this.getUserKey())
	}

	private reloadProjectTopicModeMap() {
		this.projectTopicModeUserKey = this.getUserKey()
		this.projectTopicModeMap = new Map(Object.entries(this.getProjectBucket()))
	}

	private ensureCurrentUserProjectModes() {
		if (this.projectTopicModeUserKey !== this.getUserKey()) {
			this.reloadProjectTopicModeMap()
		}
	}
}

export default new ProjectTopicService()
