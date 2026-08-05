/**
 * IframeUserInfoService
 *
 * 处理 MAGIC_GET_USER_INFO_* 消息，并把敏感字段授权统一委托给
 * IframePermissionService，避免用户信息权限拥有独立且不可管理的缓存。
 */

import { htmlMicroAppPreviewLogger } from "../../utils/htmlMicroAppPreviewLogger"
import {
	USER_INFO_MESSAGE_TYPES,
	USER_INFO_SCOPES,
	type UserInfo,
	type UserInfoGetRequest,
	type UserInfoScope,
} from "../types"

export interface UserInfoAuthorizationRequest {
	scopes: Exclude<UserInfoScope, typeof USER_INFO_SCOPES.DISPLAY>[]
	reason: string
}

export interface IframeUserInfoConfig {
	/** 向 iframe 发送消息的函数 */
	postToIframe: (message: object) => void
	/** 获取当前用户信息的函数 */
	getUserInfo: () => UserInfo | null
	/** 请求敏感用户信息前的统一授权检查。 */
	authorizeUserInfo?: (request: UserInfoAuthorizationRequest) => Promise<boolean>
}

export class IframeUserInfoService {
	private readonly cfg: IframeUserInfoConfig

	constructor(cfg: IframeUserInfoConfig) {
		this.cfg = cfg
	}

	/** 主路由入口，返回 true 表示消息已被处理。 */
	async handleMessage(type: string, payload: unknown): Promise<boolean> {
		if (type === USER_INFO_MESSAGE_TYPES.GET_USER_INFO_REQUEST) {
			await this.handleGetUserInfo(payload as UserInfoGetRequest)
			return true
		}
		return false
	}

	private async handleGetUserInfo(req: UserInfoGetRequest): Promise<void> {
		try {
			const scopes = this.normalizeScopes(req.scopes)
			if (!scopes) {
				this.respondError(req.requestId, "Invalid user info scope")
				return
			}

			let userInfo = this.cfg.getUserInfo()
			if (!userInfo) {
				this.respondError(req.requestId, "User info is not available")
				return
			}

			const sensitiveScopes = scopes.filter(
				(scope): scope is Exclude<UserInfoScope, typeof USER_INFO_SCOPES.DISPLAY> =>
					scope !== USER_INFO_SCOPES.DISPLAY,
			)
			if (sensitiveScopes.length > 0) {
				const userKeyBeforeAuthorization = this.getCurrentUserKey(userInfo)
				if (!userKeyBeforeAuthorization) {
					this.respondError(req.requestId, "User identity is not available")
					return
				}

				const allowed = await this.cfg.authorizeUserInfo?.({
					scopes: sensitiveScopes,
					reason: req.reason || "",
				})
				if (!allowed) {
					this.respondError(
						req.requestId,
						"User denied access to requested profile fields",
					)
					return
				}

				const latestUserInfo = this.cfg.getUserInfo()
				if (!latestUserInfo) {
					this.respondError(req.requestId, "User info is not available")
					return
				}
				if (this.getCurrentUserKey(latestUserInfo) !== userKeyBeforeAuthorization) {
					this.respondError(req.requestId, "User identity changed during authorization")
					return
				}
				userInfo = latestUserInfo
			}

			this.cfg.postToIframe({
				type: USER_INFO_MESSAGE_TYPES.GET_USER_INFO_RESPONSE,
				requestId: req.requestId,
				success: true,
				userInfo: this.pickUserInfoFields(userInfo, scopes),
			})
		} catch (error) {
			htmlMicroAppPreviewLogger.error("Failed to handle user info request", {
				requestId: req.requestId,
				error: error instanceof Error ? error.message : String(error),
			})
			this.respondError(
				req.requestId,
				error instanceof Error ? error.message : "Failed to get user info",
			)
		}
	}

	private respondError(requestId: string, error: string) {
		this.cfg.postToIframe({
			type: USER_INFO_MESSAGE_TYPES.GET_USER_INFO_RESPONSE,
			requestId,
			success: false,
			error,
		})
	}

	private getCurrentUserKey(userInfo: UserInfo): string | null {
		const magicId = userInfo.magic_id?.trim()
		if (magicId) return `magic_id:${magicId}`

		const userId = userInfo.user_id?.trim()
		if (userId) return `user_id:${userId}`

		return null
	}

	private normalizeScopes(rawScopes: unknown): UserInfoScope[] | null {
		if (rawScopes === undefined) return [USER_INFO_SCOPES.DISPLAY]
		if (!Array.isArray(rawScopes)) return null

		const normalized = new Set<UserInfoScope>([USER_INFO_SCOPES.DISPLAY])
		const allowedScopes = new Set<string>(Object.values(USER_INFO_SCOPES))
		for (const scope of rawScopes) {
			if (typeof scope !== "string" || !allowedScopes.has(scope)) return null
			normalized.add(scope as UserInfoScope)
		}
		return Array.from(normalized)
	}

	private pickUserInfoFields(userInfo: UserInfo, scopes: UserInfoScope[]): UserInfo {
		const result: UserInfo = {
			name: userInfo.name,
			avatar: userInfo.avatar,
		}

		if (scopes.includes(USER_INFO_SCOPES.NAME)) {
			result.nickname = userInfo.nickname || ""
			result.real_name = userInfo.real_name || ""
		}
		if (scopes.includes(USER_INFO_SCOPES.IDENTITY)) {
			result.user_id = userInfo.user_id || ""
			result.magic_id = userInfo.magic_id || ""
		}
		if (scopes.includes(USER_INFO_SCOPES.ORGANIZATION)) {
			result.organization_code = userInfo.organization_code || ""
		}

		return result
	}
}
