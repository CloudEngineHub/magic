import { vi } from "vitest"
import {
	IframePermissionService,
	type HtmlPermissionConfirmRequest,
	type IframePermissionServiceConfig,
} from "../IframePermissionService"
import {
	isHtmlPermissionGrantActive,
	type HtmlPermissionGrant,
	type HtmlPermissionGrantIdentity,
	type HtmlPermissionGrantStore,
} from "../HtmlPermissionGrantStore"
import type { HtmlPermissionScope } from "../../types"

export class MemoryGrantStore implements HtmlPermissionGrantStore {
	constructor(private readonly getNow: () => number = () => 1_000_000) {}

	grants: HtmlPermissionGrant[] = []
	getGrant = vi.fn((identity: HtmlPermissionGrantIdentity, scope: HtmlPermissionScope) => {
		this.removeExpired(this.getNow())
		return this.grants.find(
			(grant) =>
				grant.scope === scope &&
				matchesIdentity(grant, identity) &&
				isHtmlPermissionGrantActive(grant, this.getNow()),
		)
	})
	getAppGrants = vi.fn((identity: HtmlPermissionGrantIdentity) => {
		this.removeExpired(this.getNow())
		return this.grants.filter(
			(grant) =>
				matchesIdentity(grant, identity) &&
				isHtmlPermissionGrantActive(grant, this.getNow()),
		)
	})
	list = vi.fn(() => {
		this.removeExpired(this.getNow())
		return [...this.grants]
	})
	save = vi.fn((grant: HtmlPermissionGrant) => {
		this.grants = this.grants.filter(
			(item) =>
				!(
					item.mode === grant.mode &&
					item.userId === grant.userId &&
					item.projectId === grant.projectId &&
					item.appRootDir === grant.appRootDir &&
					item.entryPath === grant.entryPath &&
					item.appFingerprint === grant.appFingerprint &&
					item.scope === grant.scope
				),
		)
		this.grants.push(grant)
	})
	remove = vi.fn(
		(identity: Partial<HtmlPermissionGrantIdentity>, scope?: HtmlPermissionScope) => {
			this.grants = this.grants.filter(
				(grant) =>
					!matchesPartialIdentity(grant, identity) ||
					(scope !== undefined && grant.scope !== scope),
			)
		},
	)
	prune = vi.fn((now: number) => {
		this.removeExpired(now)
	})

	private removeExpired(now: number) {
		this.grants = this.grants.filter((grant) => isHtmlPermissionGrantActive(grant, now))
	}
}

function matchesIdentity(grant: HtmlPermissionGrant, identity: HtmlPermissionGrantIdentity) {
	return (
		grant.mode === identity.mode &&
		grant.userId === identity.userId &&
		grant.projectId === identity.projectId &&
		grant.appRootDir === identity.appRootDir &&
		grant.entryPath === identity.entryPath &&
		grant.appFingerprint === identity.appFingerprint
	)
}

function matchesPartialIdentity(
	grant: HtmlPermissionGrant,
	identity: Partial<HtmlPermissionGrantIdentity>,
) {
	return (
		(identity.mode === undefined || grant.mode === identity.mode) &&
		(identity.userId === undefined || grant.userId === identity.userId) &&
		(identity.projectId === undefined || grant.projectId === identity.projectId) &&
		(identity.appRootDir === undefined || grant.appRootDir === identity.appRootDir) &&
		(identity.entryPath === undefined || grant.entryPath === identity.entryPath) &&
		(identity.appFingerprint === undefined || grant.appFingerprint === identity.appFingerprint)
	)
}

export function createService(overrides: Partial<IframePermissionServiceConfig> = {}) {
	const getNow = overrides.getNow || (() => 1_000_000)
	const grantStore = overrides.grantStore || new MemoryGrantStore(getNow)
	const confirmPermission = vi.fn(
		overrides.confirmPermission ||
			(async (request: HtmlPermissionConfirmRequest) => ({
				allowed: true,
				ttlMs: request.defaultTtlMs,
			})),
	)
	const service = new IframePermissionService({
		appConfigState: {
			status: "loaded",
			config: {
				name: "Manifest App",
				entry: "index.html",
				permissions: {
					scopes: ["llm.use"],
					reason: "Analyze project data",
				},
			},
		},
		appInstance: {
			userId: "user-1",
			projectId: "project-1",
			appRootDir: "app/",
			entryPath: "app/index.html",
			content: "<html>manifest</html>",
		},
		...overrides,
		grantStore,
		confirmPermission,
		getNow,
	})
	return { service, grantStore, confirmPermission }
}
