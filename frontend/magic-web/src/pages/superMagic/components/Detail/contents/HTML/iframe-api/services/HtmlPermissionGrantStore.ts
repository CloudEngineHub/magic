import sha256 from "crypto-js/sha256"
import type { HtmlPermissionScope } from "../types"

export const LOCAL_STORAGE_HTML_PERMISSION_GRANT_STORE_KEY = "magic:html-app-permissions:v2"
export const HTML_PERMISSION_GRANTS_CHANGED_EVENT = "magic:html-app-permissions:changed"
export const HTML_PERMISSION_GRANTS_CHANNEL_NAME = "magic:html-app-permissions"
export const MAX_HTML_PERMISSION_GRANTS = 1000

export interface HtmlPermissionGrantIdentity {
	mode: "manifest" | "legacy"
	userId: string
	projectId: string
	appRootDir: string
	entryPath: string
	appFingerprint: string
}

export interface HtmlPermissionGrant extends HtmlPermissionGrantIdentity {
	scope: HtmlPermissionScope
	grantedAt: number
	expiresAt: number | null
}

export interface HtmlPermissionGrantStore {
	getGrant(
		identity: HtmlPermissionGrantIdentity,
		scope: HtmlPermissionScope,
	): Promise<HtmlPermissionGrant | undefined>
	getAppGrants(identity: HtmlPermissionGrantIdentity): Promise<HtmlPermissionGrant[]>
	save(grant: HtmlPermissionGrant): Promise<void>
	remove(identity: HtmlPermissionGrantIdentity, scope?: HtmlPermissionScope): Promise<void>
	prune(now: number): Promise<void>
	clear(): Promise<void>
}

export function isHtmlPermissionGrantActive(grant: HtmlPermissionGrant, now: number): boolean {
	return grant.expiresAt === null || grant.expiresAt > now
}

export function createHtmlPermissionAppKey(identity: HtmlPermissionGrantIdentity): string {
	const source = JSON.stringify([
		identity.mode,
		identity.userId,
		identity.projectId,
		identity.appRootDir,
		identity.entryPath,
		identity.appFingerprint,
	])
	return sha256(source).toString()
}
