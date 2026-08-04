import { htmlMicroAppPreviewLogger } from "../../utils/htmlMicroAppPreviewLogger"
import type { HtmlPermissionScope } from "../types"

export const SESSION_STORAGE_HTML_PERMISSION_GRANT_STORE_KEY = "magic:html-app-permissions:v1"

export interface HtmlPermissionGrant {
	mode: "manifest" | "legacy"
	userKey: string
	projectId: string
	appRootDir: string
	entryPath: string
	appFingerprint: string
	scope: HtmlPermissionScope
	grantedAt: number
	expiresAt: number
}

export interface HtmlPermissionGrantStore {
	list(): HtmlPermissionGrant[]
	save(grant: HtmlPermissionGrant): void
	remove(match: Partial<HtmlPermissionGrant>): void
	prune(now: number): void
}

function isValidGrant(value: unknown): value is HtmlPermissionGrant {
	if (!value || typeof value !== "object") return false
	const grant = value as Record<string, unknown>
	return (
		(grant.mode === "manifest" || grant.mode === "legacy") &&
		typeof grant.userKey === "string" &&
		typeof grant.projectId === "string" &&
		typeof grant.appRootDir === "string" &&
		typeof grant.entryPath === "string" &&
		typeof grant.appFingerprint === "string" &&
		typeof grant.scope === "string" &&
		typeof grant.grantedAt === "number" &&
		typeof grant.expiresAt === "number"
	)
}

function grantMatches(grant: HtmlPermissionGrant, match: Partial<HtmlPermissionGrant>) {
	return Object.entries(match).every(
		([key, value]) => grant[key as keyof HtmlPermissionGrant] === value,
	)
}

function isSameGrantIdentity(a: HtmlPermissionGrant, b: HtmlPermissionGrant) {
	return (
		a.mode === b.mode &&
		a.userKey === b.userKey &&
		a.projectId === b.projectId &&
		a.appRootDir === b.appRootDir &&
		a.entryPath === b.entryPath &&
		a.appFingerprint === b.appFingerprint &&
		a.scope === b.scope
	)
}

export class SessionStorageHtmlPermissionGrantStore implements HtmlPermissionGrantStore {
	constructor(private readonly storageKey = SESSION_STORAGE_HTML_PERMISSION_GRANT_STORE_KEY) {}

	list(): HtmlPermissionGrant[] {
		try {
			const raw = globalThis.sessionStorage?.getItem(this.storageKey)
			if (!raw) return []
			const parsed = JSON.parse(raw)
			if (!Array.isArray(parsed)) {
				htmlMicroAppPreviewLogger.error({
					eventKey: "permission_grants_storage_corrupted",
					errorKind: "permission",
					message: "Corrupted permission grants in sessionStorage",
					context: { storageKey: this.storageKey },
				})
				return []
			}
			return parsed.filter(isValidGrant)
		} catch (error) {
			htmlMicroAppPreviewLogger.error({
				eventKey: "permission_grants_storage_read_failed",
				errorKind: "permission",
				error: error,
				message: "Failed to read permission grants from sessionStorage",
			})
			return []
		}
	}

	save(grant: HtmlPermissionGrant): void {
		const grants = this.list().filter((item) => !isSameGrantIdentity(item, grant))
		grants.push(grant)
		this.write(grants)
	}

	remove(match: Partial<HtmlPermissionGrant>): void {
		const grants = this.list().filter((grant) => !grantMatches(grant, match))
		this.write(grants)
	}

	prune(now: number): void {
		const grants = this.list().filter((grant) => grant.expiresAt > now)
		this.write(grants)
	}

	private write(grants: HtmlPermissionGrant[]): void {
		try {
			globalThis.sessionStorage?.setItem(this.storageKey, JSON.stringify(grants))
		} catch (error) {
			// Storage is an optimization only. Authorization still falls back to prompting.
			htmlMicroAppPreviewLogger.warn(
				"Failed to persist permission grants to sessionStorage",
				{
					error: error instanceof Error ? error.message : String(error),
				},
			)
		}
	}
}
