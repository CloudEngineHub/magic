import { describe, expect, it } from "vitest"
import { getPromptRichTextPlainText, serializePromptRichTextLocaleValue } from "../promptRichText"
import {
	buildConcatenatedPresetContent,
	hasSelectableOptions,
	resolveDemoPromptText,
} from "../utils"
import type { FieldItem } from "../types"

function expectPresetContentText(fields: FieldItem[], locale: string, expected: string) {
	expect(getPromptRichTextPlainText(buildConcatenatedPresetContent(fields, locale))).toBe(
		expected,
	)
}

describe("MainInputContainer panel utils", () => {
	it("builds mixed preset content per field instead of switching logic for the whole list", () => {
		const fields: FieldItem[] = [
			{
				data_key: "style",
				label: { default: "Style" },
				current_value: "Oil painting",
				options: [],
				preset_content: { default: "Style: {preset_value}" },
			},
			{
				data_key: "lighting",
				label: { default: "Lighting" },
				current_value: "soft",
				options: [
					{
						value: { default: "soft", en_US: "soft" },
					},
				],
			},
			{
				data_key: "camera",
				label: { default: "Camera" },
				current_value: "close-up",
				options: [
					{
						value: { default: "close-up", en_US: "close-up" },
					},
				],
			},
			{
				data_key: "mood",
				label: { default: "Mood" },
				current_value: "calm",
				options: [],
				preset_content: { default: "Mood: {preset_value}" },
			},
		]

		expectPresetContentText(
			fields,
			"en_US",
			"Style: Oil painting, Lighting: soft, Camera: close-up, Mood: calm.",
		)
	})

	it("keeps the original fallback sentence when no field has preset_content", () => {
		const fields: FieldItem[] = [
			{
				data_key: "lighting",
				label: { default: "Lighting" },
				current_value: "soft",
				options: [
					{
						value: { default: "soft", en_US: "soft" },
					},
				],
			},
			{
				data_key: "camera",
				label: { default: "Camera" },
				current_value: "close-up",
				options: [
					{
						value: { default: "close-up", en_US: "close-up" },
					},
				],
			},
		]

		expectPresetContentText(fields, "en_US", "Lighting: soft, Camera: close-up.")
	})

	it("uses an exact custom input value when it is not one of the predefined options", () => {
		const fields: FieldItem[] = [
			{
				data_key: "pages",
				label: { zh_CN: "页数", en_US: "Pages" },
				current_value: "8",
				options: [
					{ value: "1-5", label: "1-5" },
					{ value: "6-10", label: "6-10" },
				],
				custom_input: {
					type: "number",
					min: 1,
				},
			},
		]

		expectPresetContentText(fields, "zh_CN", "页数: 8。")
		expectPresetContentText(fields, "en_US", "Pages: 8.")
	})

	it("skips fields with preset_content when current_value is undefined", () => {
		const fields: FieldItem[] = [
			{
				data_key: "style",
				label: { default: "Style" },
				options: [],
				preset_content: { default: "Style: {preset_value}" },
			},
			{
				data_key: "lighting",
				label: { default: "Lighting" },
				current_value: "soft",
				options: [
					{
						value: { default: "soft", en_US: "soft" },
					},
				],
			},
		]

		expectPresetContentText(fields, "en_US", "Lighting: soft.")
	})

	it("uses a localized preset value without changing the stable option value", () => {
		const fields: FieldItem[] = [
			{
				data_key: "style",
				label: { zh_CN: "模板", en_US: "Preset" },
				current_value: "PPT-mobile-app-feature-launch-plan",
				options: [
					{
						value: "PPT-mobile-app-feature-launch-plan",
						preset_value: {
							zh_CN: "移动应用功能发布计划（PPT-mobile-app-feature-launch-plan）",
							en_US: "Mobile App Feature Launch Plan (PPT-mobile-app-feature-launch-plan)",
						},
					},
				],
				preset_content: {
					zh_CN: "使用 PPT 模板：{preset_value}",
					en_US: "Use slide template: {preset_value}",
				},
			},
		]

		expectPresetContentText(
			fields,
			"zh_CN",
			"使用 PPT 模板：移动应用功能发布计划（PPT-mobile-app-feature-launch-plan）。",
		)
		expectPresetContentText(
			fields,
			"en_US",
			"Use slide template: Mobile App Feature Launch Plan (PPT-mobile-app-feature-launch-plan).",
		)
	})

	it("keeps prompt rich text preset_content as JSON while replacing preset value", () => {
		const fields: FieldItem[] = [
			{
				data_key: "style",
				label: { default: "Style" },
				current_value: "Oil painting",
				options: [],
				preset_content: {
					default: serializePromptRichTextLocaleValue({
						type: "doc",
						content: [
							{
								type: "paragraph",
								content: [
									{ type: "text", text: "Style: " },
									{ type: "promptPresetValue" },
								],
							},
						],
					}),
				},
			},
		]

		const content = buildConcatenatedPresetContent(fields, "en_US")

		expect(content).toEqual({
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [
						{ type: "text", text: "Style: " },
						{ type: "text", text: "Oil painting" },
						{ type: "text", text: "." },
					],
				},
			],
		})
	})

	it("preserves rich text mention nodes in preset_content", () => {
		const fields: FieldItem[] = [
			{
				data_key: "style",
				label: { default: "Style" },
				current_value: "Oil painting",
				options: [],
				preset_content: {
					default: serializePromptRichTextLocaleValue({
						type: "doc",
						content: [
							{
								type: "paragraph",
								content: [
									{
										type: "mention",
										attrs: {
											type: "skill",
											data: {
												id: "skill-1",
												name: "Render",
											},
										},
									},
									{ type: "text", text: " with " },
									{ type: "promptPresetValue" },
								],
							},
						],
					}),
				},
			},
		]

		const content = buildConcatenatedPresetContent(fields, "en_US")

		expect(content?.content?.[0].content?.[0]).toMatchObject({
			type: "mention",
			attrs: {
				type: "skill",
				data: {
					id: "skill-1",
					name: "Render",
				},
			},
		})
		expect(getPromptRichTextPlainText(content)).toBe("@Render with Oil painting.")
	})

	it("treats empty option groups as no selectable options", () => {
		const field: FieldItem = {
			data_key: "template",
			label: { default: "Template" },
			options: [
				{
					group_key: "empty",
					group_name: { default: "Empty" },
					children: [],
				},
			],
		}

		expect(hasSelectableOptions(field)).toBe(false)
	})

	it("resolves localized rich text demo prompts to plain input text", () => {
		const prompt = serializePromptRichTextLocaleValue({
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [{ type: "text", text: "分析销售趋势" }],
				},
			],
		})

		expect(
			resolveDemoPromptText(
				{
					prompt: { default: "Fallback", zh_CN: prompt },
				},
				"zh_CN",
			),
		).toBe("分析销售趋势")
	})

	it("uses description before falling back to value", () => {
		expect(
			resolveDemoPromptText({ value: "Stable ID", description: "Legacy prompt" }, "en_US"),
		).toBe("Legacy prompt")
		expect(resolveDemoPromptText({ value: "Built-in prompt" }, "en_US")).toBe("Built-in prompt")
	})

	it("continues falling back when prompt has no content", () => {
		expect(
			resolveDemoPromptText(
				{ value: "Stable ID", prompt: "  ", description: "Legacy prompt" },
				"en_US",
			),
		).toBe("Legacy prompt")
		expect(
			resolveDemoPromptText(
				{ value: "Built-in prompt", prompt: { default: "", zh_CN: "  " } },
				"zh_CN",
			),
		).toBe("Built-in prompt")
	})
})
