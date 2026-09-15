import { makeAutoObservable, reaction } from "mobx"
import { TopicMode } from "../pages/Workspace/TopicMode"
import ProjectTopicService from "@/services/superMagic/ProjectTopicService"
import superMagicModeService from "@/services/superMagic/SuperMagicModeService"
import { userStore } from "@/models/user"
import DefaultTopicModeStorageService from "@/services/superMagic/DefaultTopicModeStorageService"
import {
	getFallbackTopicModeIdentifier,
	resolveDefaultAgentSelection,
} from "@/services/superMagic/DefaultAgentSelectionService"

/**
 * Role Store
 * Manages the role (topic mode) state for super magic workspace
 */
export class RoleStore {
	currentRole: TopicMode = TopicMode.General

	constructor() {
		makeAutoObservable(this, {}, { autoBind: true })

		// Initialize from storage
		this.reresolveFromAvailability()

		// 用户、组织、平台默认员工或可用员工列表变化时重新解析运行时选择。
		reaction(
			() => [
				userStore.user.organizationCode,
				userStore.user.userInfo?.user_id,
				superMagicModeService.defaultAgentCode,
				superMagicModeService.modeList.map((item) => item.mode.identifier).join(","),
				superMagicModeService.isModeAvailabilityResolved,
			],
			([organizationCode, userId]) => {
				if (organizationCode && userId) {
					this.reresolveFromAvailability()
				}
			},
		)
	}

	private getUserKey() {
		const organizationCode = userStore.user.organizationCode || "unknown"
		const userId = userStore.user.userInfo?.user_id || "legacy"
		return `${organizationCode}/${userId}`
	}

	/**
	 * Prefer a still-available stored preference; otherwise use platform default.
	 * Does not persist automatic fallbacks.
	 */
	private resolveRuntimeRole(): TopicMode {
		const rawStored = DefaultTopicModeStorageService.getRawStoredMode({
			userKey: this.getUserKey(),
		})

		if (rawStored) {
			if (!superMagicModeService.isModeAvailabilityResolved) {
				return rawStored as TopicMode
			}
			if (superMagicModeService.isModeValid(rawStored)) return rawStored as TopicMode
		}

		return getFallbackTopicModeIdentifier()
	}

	/**
	 * Re-read availability and update runtime selection without writing localStorage.
	 */
	reresolveFromAvailability() {
		this.currentRole = this.resolveRuntimeRole()
	}

	/**
	 * Apply a resolved mode for system recovery paths without persisting.
	 */
	applyResolvedRole(mode: TopicMode) {
		if (superMagicModeService.isModeValid(mode)) {
			this.currentRole = mode
			return
		}
		this.currentRole = resolveDefaultAgentSelection().modeIdentifier as TopicMode
	}

	/**
	 * Explicit user selection: update runtime state and persist when valid.
	 */
	setCurrentRole(mode: TopicMode) {
		if (superMagicModeService.isModeValid(mode)) {
			this.currentRole = mode
			ProjectTopicService.setGlobalTopicMode(mode)
			return
		}

		// Invalid request: runtime fallback only, do not overwrite stored preference.
		this.currentRole = resolveDefaultAgentSelection().modeIdentifier as TopicMode
	}

	/**
	 * Check if current mode is record summary mode
	 */
	get isRecordSummaryMode(): boolean {
		return this.currentRole === TopicMode.RecordSummary
	}
}

export const roleStore = new RoleStore()
