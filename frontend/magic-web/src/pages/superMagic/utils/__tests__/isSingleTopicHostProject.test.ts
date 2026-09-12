import { describe, expect, it } from "vitest"
import { TopicMode } from "../../pages/Workspace/TopicMode"
import { isSingleTopicHostProject, resolveIframeHostTopicMode } from "../isSingleTopicHostProject"

describe("isSingleTopicHostProject", () => {
	it("treats MagiClaw and Chat hosts as single-topic", () => {
		expect(isSingleTopicHostProject({ project_mode: TopicMode.MagiClaw })).toBe(true)
		expect(isSingleTopicHostProject({ project_mode: TopicMode.Chat })).toBe(true)
	})

	it("does not treat multi-topic hosts as single-topic", () => {
		expect(isSingleTopicHostProject({ project_mode: TopicMode.MicroApp })).toBe(false)
		expect(isSingleTopicHostProject({ project_mode: TopicMode.General })).toBe(false)
		expect(isSingleTopicHostProject(null)).toBe(false)
		expect(isSingleTopicHostProject(undefined)).toBe(false)
	})
})

describe("resolveIframeHostTopicMode", () => {
	it("keeps the host agent pattern for single-topic projects", () => {
		expect(resolveIframeHostTopicMode({ project_mode: TopicMode.MagiClaw })).toBe(
			TopicMode.MagiClaw,
		)
		expect(resolveIframeHostTopicMode({ project_mode: TopicMode.Chat })).toBe(TopicMode.Chat)
	})

	it("falls back to MicroApp for other hosts", () => {
		expect(resolveIframeHostTopicMode({ project_mode: TopicMode.General })).toBe(
			TopicMode.MicroApp,
		)
		expect(resolveIframeHostTopicMode(null)).toBe(TopicMode.MicroApp)
	})
})
