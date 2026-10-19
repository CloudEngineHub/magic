import { beforeEach, describe, expect, it, vi } from "vitest"
import cache from "../SuperMagicTopicModelCacheService"
import { userStore } from "@/models/user"
import {
	ModelStatusEnum,
	type ModelItem,
} from "@/pages/superMagic/components/MessageEditor/components/ModelSwitch/types"
import { getModelDefaultReasoningEffort } from "@/pages/superMagic/components/MessageEditor/components/ModelSwitch/utils"
import { serializeMessageContent } from "@/pages/superMagic/services/messageQueueSerialization"

vi.mock("@/models/user", () => ({
	userStore: { user: { organizationCode: "mock-org", userInfo: { user_id: "mock-user" } } },
}))

vi.mock("@/infrastructure/logger", () => {
	const logger = { log: vi.fn(), error: vi.fn(), report: vi.fn(), warn: vi.fn(), trace: vi.fn() }
	return { logger: { ...logger, createLogger: () => logger } }
})
vi.mock("@/app/services/storage/storageFailure", () => ({ reportCaughtStorageFailure: vi.fn() }))
vi.mock("@/utils/storage", () => ({ platformKey: (key: string) => key }))
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock("@/services/superMagic/DefaultAgentSelectionService", () => ({
	resolveAgentSelection: () => ({ topicPattern: "general" }),
}))
vi.mock("@/pages/superMagic/components/MessageEditor/utils/mention", () => ({
	transformMentions: (items: unknown[]) => items,
}))

/** 无真实模型或用户数据的能力夹具。 */
function model(): ModelItem {
	return {
		id: "mock-model",
		group_id: "mock-group",
		model_id: "mock-auto",
		model_name: "Mock model",
		provider_model_id: "mock-provider",
		model_icon: "",
		model_description: "",
		model_status: ModelStatusEnum.Normal,
		sort: 0,
		reasoning_effort_levels: ["none", "low", "medium", "high"],
		resolved_model_id: "mock-leaf",
	}
}

beforeEach(() => {
	const storage = new Map<string, string>()
	Object.defineProperty(window, "localStorage", {
		configurable: true,
		value: {
			getItem: (key: string) => storage.get(key) ?? null,
			setItem: (key: string, value: string) => storage.set(key, value),
			removeItem: (key: string) => storage.delete(key),
		},
	})
	userStore.user.organizationCode = "mock-org"
	userStore.user.userInfo!.user_id = "mock-user"
})

describe("思考偏好和队列快照", () => {
	it("后台默认值只用于展示，发送及快照不冻结继承档位", () => {
		const item = { ...model(), reasoning_effort_default: "medium" as const }
		expect(getModelDefaultReasoningEffort(item)).toBe("medium")
		expect(cache.getReasoningEffort(item)).toBeUndefined()
		expect(cache.snapshotLanguageModel(item).reasoning_effort).toBeNull()
		expect(
			serializeMessageContent({ type: "doc" }, [], item).extra.super_agent.model,
		).not.toHaveProperty("reasoning_effort")
		cache.setReasoningEffort(item, "none")
		expect(
			serializeMessageContent({ type: "doc" }, [], item).extra.super_agent.model
				.reasoning_effort,
		).toBe("none")
	})

	it("默认为空、字段缺失、默认档移除或未知档位时不补造默认值", () => {
		expect(getModelDefaultReasoningEffort(model())).toBeUndefined()
		expect(
			getModelDefaultReasoningEffort({ ...model(), reasoning_effort_default: null }),
		).toBeUndefined()
		expect(
			getModelDefaultReasoningEffort({
				...model(),
				reasoning_effort_default: "high",
				reasoning_effort_levels: ["low"],
			}),
		).toBeUndefined()
		expect(
			getModelDefaultReasoningEffort({
				...model(),
				reasoning_effort_default: "unknown" as never,
			}),
		).toBeUndefined()
		expect(
			getModelDefaultReasoningEffort({ ...model(), reasoning_effort_default: "none" }),
		).toBe("none")
	})

	it("按用户、组织及逻辑模型隔离，并读取动态模型能力", () => {
		const item = model()
		cache.setReasoningEffort(item, "high")
		expect(cache.getReasoningEffort(item)).toBe("high")
		expect(cache.getReasoningEffort({ ...item, model_id: "mock-other" })).toBeUndefined()
		userStore.user.organizationCode = "mock-other-org"
		expect(cache.getReasoningEffort(item)).toBeUndefined()
		userStore.user.organizationCode = "mock-org"
		userStore.user.userInfo!.user_id = "mock-other-user"
		expect(cache.getReasoningEffort(item)).toBeUndefined()
	})

	it("区分默认和关闭，并过滤已移除档位", () => {
		const item = model()
		cache.setReasoningEffort(item, "none")
		expect(cache.getReasoningEffort(item)).toBe("none")
		expect(
			cache.getReasoningEffort({ ...item, reasoning_effort_levels: ["low"] }),
		).toBeUndefined()
		cache.setReasoningEffort(item)
		expect(cache.getReasoningEffort(item)).toBeUndefined()
	})

	it("已入队强度与默认快照不受后续偏好变化影响", () => {
		const item = model()
		const defaultSnapshot = JSON.parse(JSON.stringify(cache.snapshotLanguageModel(item)))
		cache.setReasoningEffort(item, "none")
		const offSnapshot = cache.snapshotLanguageModel(item)
		cache.setReasoningEffort(item, "high")
		const serialize = (selected: ModelItem) =>
			serializeMessageContent({ type: "doc" }, [], selected).extra.super_agent.model
		expect(serialize(defaultSnapshot)).not.toHaveProperty("reasoning_effort")
		expect(serialize(offSnapshot)).toMatchObject({
			model_id: "mock-auto",
			reasoning_effort: "none",
		})
		expect(serialize(item)).toMatchObject({ reasoning_effort: "high" })
		expect(item).not.toHaveProperty("reasoning_effort")
	})
})
