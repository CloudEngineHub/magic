import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
	toChangedEnterpriseWatermarkParams,
	toEnterpriseInfoFormState,
} from "../../../enterprise/src/features/enterprise-info/api.ts"
import {
	createEmptyEnterpriseInfoFormState,
	createEnterpriseInfoSchema,
	enterpriseInfoSections,
	getSectionDescriptionKey,
} from "../../../enterprise/src/features/enterprise-info/utils.ts"
import { normalizeIdentityWatermark } from "../../../src/components/identity-watermark/watermark-utils.ts"

const baseInfo = { code: "org-1", name: "示例企业" }

describe("enterprise info watermark section", () => {
	it("registers the watermark section after basic and contact", () => {
		assert.deepEqual(
			enterpriseInfoSections.map((section) => section.id),
			["basic", "contact", "watermark"],
		)
		assert.equal(enterpriseInfoSections[2].titleKey, "enterpriseInfo.section.watermark")
		assert.equal(getSectionDescriptionKey("watermark"), "enterpriseInfo.sectionDesc.watermark")
		assert.equal(getSectionDescriptionKey("contact"), "enterpriseInfo.sectionDesc.contact")
	})
})

describe("enterprise info watermark form state", () => {
	it("falls back to the backend default when the watermark endpoint omits it", () => {
		const expected = { enabled: false, fields: ["real_name"], depth: "light" }

		assert.deepEqual(toEnterpriseInfoFormState(baseInfo).watermark, expected)
		assert.deepEqual(toEnterpriseInfoFormState(baseInfo, { watermark: null }).watermark, expected)
		assert.deepEqual(
			toEnterpriseInfoFormState(baseInfo, {}).watermark,
			expected,
		)
	})

	it("keeps the organization watermark and normalizes its fields and depth", () => {
		const formState = toEnterpriseInfoFormState(baseInfo, {
			watermark: {
				enabled: true,
				fields: ["phone", "unknown_field", "real_name", "phone"],
				depth: "strong",
			},
		})

		assert.deepEqual(formState.watermark, {
			enabled: true,
			fields: ["real_name", "phone"],
			depth: "strong",
		})
		// 企业资料字段沿用接口返回值，不受水印归一化影响。
		assert.equal(formState.name, "示例企业")
		assert.equal(formState.magic_organization_code, "org-1")
	})

	it("keeps an explicitly empty field list so the user must pick a field before saving", () => {
		assert.deepEqual(
			normalizeIdentityWatermark({ enabled: true, fields: [], depth: "light" }),
			{ enabled: true, fields: [], depth: "light" },
		)
	})

	it("submits the whole watermark object only when the watermark is dirty", () => {
		const values = createEmptyEnterpriseInfoFormState()
		values.watermark = { enabled: true, fields: ["real_name", "phone"], depth: "strong" }

		assert.equal(toChangedEnterpriseWatermarkParams(values, {}), null)
		assert.equal(toChangedEnterpriseWatermarkParams(values, { name: true }), null)
		assert.deepEqual(
			toChangedEnterpriseWatermarkParams(values, { watermark: { enabled: true } }),
			{
				watermark: { enabled: true, fields: ["real_name", "phone"], depth: "strong" },
			},
		)
	})
})

describe("enterprise info watermark schema", () => {
	function parseWatermark(watermark: unknown) {
		const schema = createEnterpriseInfoSchema((key) => key)

		// 企业信息用的是整表 schema，这里补齐必填的企业名称与编码，只观察水印分支。
		return schema.safeParse({
			...createEmptyEnterpriseInfoFormState(),
			magic_organization_code: baseInfo.code,
			name: baseInfo.name,
			watermark,
		})
	}

	it("allows an empty field list while the watermark is disabled", () => {
		assert.equal(parseWatermark({ enabled: false, fields: [], depth: "light" }).success, true)
	})

	it("requires at least one field while the watermark is enabled", () => {
		const result = parseWatermark({ enabled: true, fields: [], depth: "light" })

		assert.equal(result.success, false)
		if (!result.success) {
			const issue = result.error.issues.find((item) => item.path.join(".") === "watermark.fields")

			assert.equal(issue?.message, "enterpriseInfo.validation.watermarkContentRequired")
		}
	})

	it("rejects a depth value outside the supported options", () => {
		assert.equal(
			parseWatermark({ enabled: false, fields: ["real_name"], depth: "extreme" }).success,
			false,
		)
	})
})
