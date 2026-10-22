import { describe, expect, it } from "vitest"
import { createResearchFileDisplayResolver } from "../services/researchFileDisplay"

const resolve = createResearchFileDisplayResolver(
	{
		personas: "人设",
		panels: "人设分组",
		studies: "研究",
		templates: "报告模板",
		defaultTemplate: "人声（默认）",
		interviews: "访谈记录",
		discussions: "小组讨论",
		study: {
			report: "研究报告",
			plan: "研究方案",
			deskResearch: "市场洞察",
			validation: "验证问卷",
			panel: "受访者名单",
		},
	},
	{ studies: "studies-icon" },
	{
		personaName: (path) => (path === "personas/p_a.json" ? "王浩" : undefined),
		interviewLabel: (path) =>
			path === "studies/x/interviews/p_a.json" ? "王浩 · 访谈记录" : undefined,
	},
)

const dir = (path: string) =>
	resolve({ path, name: path.replace(/\/$/, "").split("/").pop() ?? "", isDirectory: true })
const file = (path: string) =>
	resolve({ path, name: path.split("/").pop() ?? "", isDirectory: false })

describe("createResearchFileDisplayResolver", () => {
	it("names the research folders and attaches icons", () => {
		expect(dir("personas")).toMatchObject({ name: "人设" })
		expect(dir("panels/")).toMatchObject({ name: "人设分组" })
		expect(dir("studies")).toEqual({ name: "研究", icon: "studies-icon" })
		expect(dir("templates")).toMatchObject({ name: "报告模板" })
	})

	it("hides template conversation markers and everything below them", () => {
		expect(dir("template-chats")).toEqual({ hidden: true })
		expect(file("template-chats/971.json")).toEqual({ hidden: true })
	})

	it("leaves unknown folders alone", () => {
		expect(dir("study-topics")).toBeNull()
		expect(dir("docs")).toBeNull()
		expect(dir("docs/personas")).toBeNull()
	})

	it("names templates, the default one by its Chinese name", () => {
		expect(file("templates/voices.html")).toEqual({ name: "人声（默认）" })
		expect(file("templates/kids-doodle.html")).toEqual({ name: "kids-doodle" })
		expect(file("templates/notes.txt")).toBeNull()
	})

	it("names study files and sub folders only directly under studies/<slug>/", () => {
		expect(file("studies/x/report.html")).toEqual({ name: "研究报告" })
		expect(file("studies/x/plan.md")).toEqual({ name: "研究方案" })
		expect(file("studies/x/desk-research.md")).toEqual({ name: "市场洞察" })
		expect(file("studies/x/panel.json")).toEqual({ name: "受访者名单" })
		expect(dir("studies/x/interviews")).toEqual({ name: "访谈记录" })
		expect(dir("studies/x/discussions")).toEqual({ name: "小组讨论" })
		expect(file("studies/x/interviews/report.html")).toBeNull()
		expect(file("studies/x/study.json")).toBeNull()
		expect(dir("studies/x")).toBeNull()
	})

	it("shows persona and interview names once parsed, otherwise the file name", () => {
		expect(file("personas/p_a.json")).toEqual({ name: "王浩" })
		expect(file("personas/p_b.json")).toBeNull()
		expect(file("studies/x/interviews/p_a.json")).toEqual({ name: "王浩 · 访谈记录" })
		expect(file("studies/x/interviews/p_b.json")).toBeNull()
		expect(file("docs/personas/p_a.json")).toBeNull()
	})

	it("never touches a normal project", () => {
		expect(file("docs/report.html")).toBeNull()
		expect(file("report.html")).toBeNull()
	})
})
