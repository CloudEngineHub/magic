import { describe, expect, it } from "vitest"
import { resolvePlan } from "../model"

describe("resolvePlan", () => {
	it("renders partial strings, arrays, files, and nested data model fields while streaming", () => {
		const plan = resolvePlan({
			id: "plan-streaming",
			rawArguments:
				'{"data_model":[{"table_name":"tasks","purpose":"保存任务","fields":[{"name":"title","type":"string","description":"任务标',
		})

		expect(plan.isComplete).toBe(false)
		expect(plan.dataModel).toEqual([
			{
				tableName: "tasks",
				purpose: "保存任务",
				fields: [
					{
						name: "title",
						type: "string",
						description: "任务标",
						text: "",
						details: [],
					},
				],
			},
		])

		const listPlan = resolvePlan({
			id: "plan-streaming-list",
			rawArguments:
				'{"requirements":["支持创建任务","支持按状态筛选"],"files":[{"path":"index.html","purpose":"应用入',
		})

		expect(listPlan.requirements).toEqual(["支持创建任务", "支持按状态筛选"])
		expect(listPlan.files).toEqual([{ path: "index.html", purpose: "应用入" }])
	})

	it("handles escape and unicode boundaries without throwing", () => {
		const escapedPlan = resolvePlan({
			id: "plan-escape",
			rawArguments: '{"summary":"第一行\\n第二行\\',
		})
		expect(escapedPlan.summary).toBe("第一行\n第二行")
		expect(escapedPlan.isComplete).toBe(false)

		const unicodePlan = resolvePlan({
			id: "plan-unicode",
			rawArguments: '{"summary":"\\u4f60\\u597',
		})
		expect(unicodePlan.summary).toBe("你")
		expect(unicodePlan.isComplete).toBe(false)
	})

	it("matches complete JSON parsing and accepts arbitrary field order", () => {
		const rawArguments = JSON.stringify({
			assumptions: ["无需兼容旧数据"],
			plan_title: "任务管理应用",
			files: [{ purpose: "应用入口", path: "index.html" }],
			summary: "创建并管理任务",
		})
		const plan = resolvePlan({ id: "plan-complete", rawArguments })

		expect(plan.isComplete).toBe(true)
		expect(plan.title).toBe("任务管理应用")
		expect(plan.summary).toBe("创建并管理任务")
		expect(plan.files).toEqual([{ path: "index.html", purpose: "应用入口" }])
		expect(plan.assumptions).toEqual(["无需兼容旧数据"])
	})

	it("uses completed detail data as the authoritative plan", () => {
		const plan = resolvePlan({
			id: "plan-detail",
			rawArguments: '{"plan_title":"流式标题',
			detail: {
				data: {
					title: "最终标题",
					summary: "最终摘要",
					status: "pending",
				},
			},
		})

		expect(plan.isComplete).toBe(true)
		expect(plan.title).toBe("最终标题")
		expect(plan.summary).toBe("最终摘要")
	})

	it.each([
		["approved", "approved"],
		["revision_requested", "revision_requested"],
		["cancelled", "cancelled"],
		["timeout", "timeout"],
	])("keeps the completed %s status", (status, expected) => {
		const plan = resolvePlan({
			id: `plan-${status}`,
			detail: {
				data: {
					status,
					title: "已完成计划",
				},
			},
		})

		expect(plan.isComplete).toBe(true)
		expect(plan.status).toBe(expected)
	})

	it("formats structured data model fields instead of rendering object placeholders", () => {
		const plan = resolvePlan({
			id: "plan-1",
			rawArguments: JSON.stringify({
				data_model: [
					{
						table_name: "activities",
						purpose: "存储活动信息",
						fields: [
							{
								name: "title",
								type: "string",
								description: "活动名称",
								required: true,
							},
							{
								field_name: "capacity",
								field_type: "number",
								purpose: "活动名额",
							},
						],
					},
				],
			}),
		})

		expect(plan.dataModel[0]?.fields).toEqual([
			{
				name: "title",
				type: "string",
				description: "活动名称",
				text: "",
				details: [{ label: "required", value: "true" }],
			},
			{
				name: "capacity",
				type: "number",
				description: "活动名额",
				text: "",
				details: [],
			},
		])
	})

	it("parses legacy Python dictionary fields from completed tool details", () => {
		const plan = resolvePlan({
			id: "plan-2",
			detail: {
				data: {
					data_model: [
						{
							table_name: "activities",
							purpose: "存储活动信息",
							fields: [
								"{'key': 'name', 'name': '活动名称', 'type': 'text', 'required': True}",
							],
						},
					],
				},
			},
		})

		expect(plan.dataModel[0]?.fields).toEqual([
			{
				name: "name",
				type: "text",
				description: "活动名称",
				text: "",
				details: [{ label: "required", value: "true" }],
			},
		])
	})
})
