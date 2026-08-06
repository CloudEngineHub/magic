import { beforeEach, describe, expect, it, vi } from "vitest"
import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"

const userStoreMock = vi.hoisted(() => ({
	user: {
		organizationCode: "test-org",
		userInfo: {
			user_id: "test-user-123",
		},
	},
}))

const modeServiceMock = vi.hoisted(() => ({
	defaultAgentCode: undefined as string | undefined,
	validModes: new Set<string>([
		"general",
		"chat",
		"data_analysis",
		"ppt",
		"report",
		"summary",
		"design",
	]),
}))

vi.mock("@/models/user", () => ({
	userStore: userStoreMock,
}))

vi.mock("@/utils/storage", () => ({
	platformKey: (value: string) => `MAGIC:${value}`,
}))

vi.mock("@/stores/interface", () => ({
	interfaceStore: {
		isMobile: false,
	},
}))

vi.mock("../SuperMagicModeService", () => ({
	default: {
		get defaultAgentCode() {
			return modeServiceMock.defaultAgentCode
		},
		get modeList() {
			return Array.from(modeServiceMock.validModes).map((identifier) => ({
				mode: { identifier },
			}))
		},
		isModeValid: vi.fn((mode: string, agentCode?: string | null) => {
			const identifier = mode === TopicMode.CustomAgent ? agentCode : mode
			return Boolean(identifier && modeServiceMock.validModes.has(identifier))
		}),
		isModeVisible: vi.fn(() => true),
	},
}))

import ProjectTopicService from "../ProjectTopicService"

const storeKey = "MAGIC:super_magic/topic_mode_store"

function createService() {
	return new (ProjectTopicService.constructor as new () => typeof ProjectTopicService)()
}

function seedStore(
	users: Record<
		string,
		{
			global?: TopicMode
			projects?: Record<string, TopicMode>
		}
	>,
) {
	localStorage.setItem(
		storeKey,
		JSON.stringify({
			version: 1,
			users,
		}),
	)
}

describe("ProjectTopicService", () => {
	beforeEach(() => {
		localStorage.clear()
		userStoreMock.user.organizationCode = "test-org"
		userStoreMock.user.userInfo = {
			user_id: "test-user-123",
		}
		modeServiceMock.defaultAgentCode = undefined
		modeServiceMock.validModes = new Set([
			TopicMode.General,
			TopicMode.Chat,
			TopicMode.DataAnalysis,
			TopicMode.PPT,
			TopicMode.Report,
			TopicMode.RecordSummary,
			TopicMode.Design,
		])
	})

	it("loads the current user's saved project modes", () => {
		seedStore({
			"test-org/test-user-123": {
				projects: {
					"workspace-1/project-1": TopicMode.Report,
				},
			},
		})

		const service = createService()

		expect(service.getProjectDefaultTopicMode("workspace-1", "project-1")).toBe(
			TopicMode.Report,
		)
	})

	it("keeps saved project and global choices ahead of the platform default", () => {
		modeServiceMock.defaultAgentCode = "configured-agent"
		modeServiceMock.validModes.add("configured-agent")
		seedStore({
			"test-org/test-user-123": {
				global: TopicMode.DataAnalysis,
				projects: {
					"workspace-1/project-1": TopicMode.PPT,
				},
			},
		})
		const service = createService()

		expect(service.getProjectDefaultTopicMode("workspace-1", "project-1")).toBe(TopicMode.PPT)
		expect(service.getProjectDefaultTopicMode("workspace-1", "project-2")).toBe(
			TopicMode.DataAnalysis,
		)
	})

	it("uses a configured custom agent without persisting the automatic fallback", () => {
		modeServiceMock.defaultAgentCode = "configured-agent"
		modeServiceMock.validModes.add("configured-agent")
		const service = createService()

		expect(service.getGlobalTopicMode()).toBe("configured-agent")
		expect(service.getProjectDefaultTopicMode("workspace-1", "project-1")).toBe(
			"configured-agent",
		)
		expect(localStorage.getItem(storeKey)).toBeNull()
		expect(service.projectTopicModeMap.has("workspace-1/project-1")).toBe(false)
	})

	it("supports a configured built-in mode", () => {
		modeServiceMock.defaultAgentCode = TopicMode.PPT
		const service = createService()

		expect(service.getGlobalTopicMode()).toBe(TopicMode.PPT)
		expect(localStorage.getItem(storeKey)).toBeNull()
	})

	it("falls back to general when the configured default is missing or unavailable", () => {
		const service = createService()
		expect(service.getGlobalTopicMode()).toBe(TopicMode.General)

		modeServiceMock.defaultAgentCode = "unavailable-agent"
		expect(service.getGlobalTopicMode()).toBe(TopicMode.General)
		expect(localStorage.getItem(storeKey)).toBeNull()
	})

	it("returns the raw global choice without replacing an unavailable employee", () => {
		seedStore({
			"test-org/test-user-123": {
				global: "unavailable-agent" as TopicMode,
			},
		})
		const service = createService()

		expect(service.getRawGlobalTopicMode()).toBe("unavailable-agent")
		expect(service.getGlobalTopicMode()).toBe(TopicMode.General)
	})

	it("does not copy a global choice into the project cache", () => {
		seedStore({
			"test-org/test-user-123": {
				global: TopicMode.DataAnalysis,
			},
		})
		const service = createService()

		expect(service.getProjectDefaultTopicMode("workspace-1", "project-1")).toBe(
			TopicMode.DataAnalysis,
		)
		expect(service.projectTopicModeMap.has("workspace-1/project-1")).toBe(false)
	})

	it("persists only explicit global and project selections", () => {
		const service = createService()

		service.setGlobalTopicMode(TopicMode.PPT)
		service.setProjectDefaultTopicMode("workspace-1", "project-1", TopicMode.Report)

		expect(JSON.parse(localStorage.getItem(storeKey) || "{}")).toEqual({
			version: 1,
			users: {
				"test-org/test-user-123": {
					global: TopicMode.PPT,
					projects: {
						"workspace-1/project-1": TopicMode.Report,
					},
				},
			},
		})
	})

	it("reloads project selections after an organization or user change", () => {
		seedStore({
			"test-org/test-user-123": {
				projects: {
					"workspace-1/project-1": TopicMode.Report,
				},
			},
			"other-org/other-user": {
				projects: {
					"workspace-1/project-1": TopicMode.PPT,
				},
			},
		})
		const service = createService()

		expect(service.getProjectDefaultTopicMode("workspace-1", "project-1")).toBe(
			TopicMode.Report,
		)

		userStoreMock.user.organizationCode = "other-org"
		userStoreMock.user.userInfo = { user_id: "other-user" }

		expect(service.getProjectDefaultTopicMode("workspace-1", "project-1")).toBe(TopicMode.PPT)
	})

	it("validates custom-agent topics with their agent code", () => {
		modeServiceMock.validModes.add("configured-agent")
		const service = createService()

		expect(service.isTopicModeValid(TopicMode.CustomAgent, "configured-agent")).toBe(true)
		expect(service.isTopicModeValid(TopicMode.CustomAgent, "missing-agent")).toBe(false)
	})
})
