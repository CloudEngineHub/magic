import { describe, expect, it } from "vitest"
import { resolvePlan } from "../model"

describe("resolvePlan", () => {
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
