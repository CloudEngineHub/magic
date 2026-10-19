import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { PERMISSION_KEY_MAP } from "../../../src/constants/permissions.ts"
import { RouteGroup, RouteName, RouteSection } from "../../../src/constants/routes.ts"
import { RuntimeMode } from "../../../src/constants/runtime.ts"
import type { AccessContext } from "../../../src/runtime/types.ts"
import { createNavigation } from "../../../src/routes/menu.ts"
import { createRoutes } from "../../../src/routes/routes.tsx"

const embeddedRoutes = createRoutes(RuntimeMode.Embedded)
const standaloneRoutes = createRoutes(RuntimeMode.Standalone)

function createAccess(overrides: Partial<AccessContext> = {}): AccessContext {
	return {
		organizationCode: "organization-code",
		hasTeamshareAllPermissions: false,
		isOfficialOrganization: false,
		isPersonalOrganization: false,
		magicPermissionKeys: [],
		teamsharePermissionKeys: [],
		user: { id: "user-id", name: "Admin" },
		organization: {
			organizationCode: "organization-code",
			name: "Organization",
		},
		...overrides,
	}
}

function getRoute(name: string, routes = embeddedRoutes) {
	const visit = (candidates: typeof routes): (typeof routes)[number] | undefined => {
		for (const route of candidates) {
			if (route.name === name) return route
			const child = route.children ? visit(route.children) : undefined
			if (child) return child
		}
		return undefined
	}

	return visit(routes)
}

function findRoute(name: string, routes = embeddedRoutes) {
	const route = getRoute(name, routes)
	assert.ok(route, `Missing route: ${name}`)
	assert.ok(route.validate, `Missing route validator: ${name}`)
	return route
}

function canAccess(name: string, access: AccessContext, routes = embeddedRoutes) {
	return findRoute(name, routes).validate!(access)
}

function platformMenuItems(access: AccessContext, routes = embeddedRoutes) {
	return createNavigation(routes, access)
		.filter((section) => section.id === RouteSection.Platform)
		.flatMap((section) => section.groups.flatMap((group) => group.items))
		.map((item) => item.titleKey)
}

describe("platform route access", () => {
	it("registers custom provider license in host and standalone modes", () => {
		const access = createAccess({
			isOfficialOrganization: true,
			magicPermissionKeys: [PERMISSION_KEY_MAP.PLATFORM_INFO_MANAGEMENT_QUERY],
		})

		assert.ok(getRoute(RouteName.PlatformCustomProviderLicense, embeddedRoutes))
		assert.equal(getRoute(RouteName.PlatformAiWatermark, embeddedRoutes), undefined)
		assert.ok(getRoute(RouteName.PlatformCustomProviderLicense, standaloneRoutes))
		assert.ok(getRoute(RouteName.PlatformAiWatermark, standaloneRoutes))
		assert.deepEqual(platformMenuItems(access, embeddedRoutes), [
			"nav.item.platformInfo",
			"nav.item.customServiceProviderLicense",
			"nav.item.modelMultiplier",
		])
		assert.deepEqual(platformMenuItems(access, standaloneRoutes), [
			"nav.item.platformInfo",
			"nav.item.aiWatermark",
			"nav.item.customServiceProviderLicense",
			"nav.item.modelMultiplier",
		])
	})

	it("uses page-level platform information permissions for settings pages", () => {
		const access = createAccess({
			isOfficialOrganization: true,
			magicPermissionKeys: [PERMISSION_KEY_MAP.PLATFORM_INFO_MANAGEMENT_QUERY],
		})

		assert.equal(canAccess(RouteName.PlatformInfo, access), true)
		assert.equal(
			canAccess(RouteName.PlatformCustomProviderLicense, access),
			true,
		)
		assert.equal(canAccess(RouteName.PlatformAiWatermark, access, standaloneRoutes), true)
		assert.equal(canAccess(RouteName.PlatformMaintenance, access), false)
		assert.deepEqual(platformMenuItems(access), [
			"nav.item.platformInfo",
			"nav.item.customServiceProviderLicense",
			"nav.item.modelMultiplier",
		])
	})

	it("places model multiplier under the model management navigation group", () => {
		const access = createAccess({
			isOfficialOrganization: true,
			magicPermissionKeys: [PERMISSION_KEY_MAP.PLATFORM_INFO_MANAGEMENT_QUERY],
		})

		assert.equal(canAccess(RouteName.PlatformModelMultiplier, access), true)
		assert.equal(
			getRoute(RouteName.PlatformModelMultiplier)?.meta?.group,
			RouteGroup.ModelManagement,
		)
	})

	it("does not expose unrelated platform menus for a page-specific permission", () => {
		const access = createAccess({
			isOfficialOrganization: true,
			magicPermissionKeys: [PERMISSION_KEY_MAP.INFO_MANAGEMENT_QUERY],
		})

		assert.equal(canAccess(RouteName.PlatformMaintenance, access), true)
		assert.equal(canAccess(RouteName.PlatformInfo, access), false)
		assert.equal(
			canAccess(RouteName.PlatformCustomProviderLicense, access),
			false,
		)
		assert.equal(canAccess(RouteName.PlatformAiWatermark, access, standaloneRoutes), false)
		assert.deepEqual(platformMenuItems(access, standaloneRoutes), [
			"nav.item.platformMaintenance",
		])
	})

	it("does not let the broad Magic administrator group enter platform pages", () => {
		const access = createAccess({
			isOfficialOrganization: true,
			magicPermissionKeys: [PERMISSION_KEY_MAP.MAGIC_ALL_PERMISSIONS],
		})

		assert.equal(
			canAccess(RouteName.PlatformCustomProviderLicense, access),
			false,
		)
		assert.equal(canAccess(RouteName.PlatformAiWatermark, access, standaloneRoutes), false)
		assert.deepEqual(platformMenuItems(access, standaloneRoutes), [])
	})

	it("keeps platform settings restricted to the official organization", () => {
		const access = createAccess({
			isOfficialOrganization: false,
			magicPermissionKeys: [PERMISSION_KEY_MAP.PLATFORM_INFO_MANAGEMENT_QUERY],
		})

		assert.equal(canAccess(RouteName.PlatformInfo, access), false)
		assert.equal(
			canAccess(RouteName.PlatformCustomProviderLicense, access),
			false,
		)
		assert.equal(canAccess(RouteName.PlatformAiWatermark, access, standaloneRoutes), false)
		assert.deepEqual(platformMenuItems(access, standaloneRoutes), [])
	})

	it("keeps the platform group behavior through the concrete page permission", () => {
		const access = createAccess({
			isOfficialOrganization: true,
			magicPermissionKeys: [PERMISSION_KEY_MAP.MAGIC_PLATFORM_PERMISSIONS],
		})

		assert.equal(
			canAccess(RouteName.PlatformCustomProviderLicense, access),
			true,
		)
		assert.equal(canAccess(RouteName.PlatformAiWatermark, access, standaloneRoutes), true)
	})

	it("shows PPT templates for either legacy permission and keeps personal orgs hidden", () => {
		const queryAccess = createAccess({
			isOfficialOrganization: true,
			magicPermissionKeys: [PERMISSION_KEY_MAP.SLIDES_TEMPLATE_QUERY],
		})
		const editAccess = createAccess({
			isOfficialOrganization: true,
			magicPermissionKeys: [PERMISSION_KEY_MAP.SLIDES_TEMPLATE_EDIT],
		})
		const personalAccess = createAccess({
			isOfficialOrganization: true,
			isPersonalOrganization: true,
			magicPermissionKeys: [PERMISSION_KEY_MAP.SLIDES_TEMPLATE_QUERY],
		})

		assert.equal(canAccess(RouteName.PlatformSlidesTemplate, queryAccess), true)
		assert.equal(canAccess(RouteName.PlatformSlidesTemplate, editAccess), true)
		assert.equal(canAccess(RouteName.PlatformSlidesTemplate, personalAccess), false)
		assert.deepEqual(platformMenuItems(queryAccess), ["nav.item.slidesTemplate"])
	})
})
