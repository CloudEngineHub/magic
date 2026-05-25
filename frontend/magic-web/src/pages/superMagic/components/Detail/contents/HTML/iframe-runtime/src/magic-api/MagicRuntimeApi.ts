/**
 * MagicRuntimeApi
 *
 * Exposes runtime context to HTML micro-apps. Sensitive credentials stay in the
 * parent window; the iframe receives only the normalized current-user context.
 */

import { MagicBaseApi } from "./MagicBaseApi"

export interface MagicRuntimeUser {
	user_id: string
	magic_id?: string
	organization_code?: string
	nickname?: string
	real_name?: string
	avatar_url?: string
	phone?: string
	email?: string | null
	job_title?: string
	path_nodes?: unknown[]
}

export interface MagicRuntime {
	userId: string
	userName: string
	user: MagicRuntimeUser
	organizationCode: string
	language: string
}

export class MagicRuntimeApi extends MagicBaseApi {
	install(): void {
		if (!window.Magic) window.Magic = {}
		if (window.Magic.getRuntime) return

		window.Magic.getRuntime = (): Promise<MagicRuntime> => {
			return this.request<MagicRuntime>("MAGIC_RUNTIME_GET_REQUEST", {}, 15000, (data) => {
				const content = data["content"]
				if (!content || typeof content !== "object") {
					throw new Error("getRuntime: invalid runtime response")
				}
				return content as MagicRuntime
			})
		}
	}
}
