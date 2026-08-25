import { describe, expect, it } from "vitest"
import { createCodeSplittingGroups } from "../code-splitting-groups"

function getGroup(name: string) {
	const group = createCodeSplittingGroups().find((item) => item.name === name)
	if (!group) throw new Error(`Missing code-splitting group: ${name}`)
	return group
}

describe("locale code-splitting groups", () => {
	it.each([
		["locale-zh-cn", "zh_CN"],
		["locale-en-us", "en_US"],
	] as const)("groups %s locale JSON modules across all overlays", (groupName, locale) => {
		const group = getGroup(groupName)

		expect(group.entriesAware).toBe(false)
		expect(group.priority).toBe(100)
		expect(group.test(`/project/src/assets/locales/${locale}/common.json`)).toBe(true)
		expect(
			group.test(`/project/enterprise/src/assets/locales/${locale}/super/mainInput.json`),
		).toBe(true)
		expect(
			group.test(`/project/customer/src/assets/locales/${locale}/common.json?import`),
		).toBe(true)
	})

	it("keeps languages and non-locale JSON modules isolated", () => {
		const zhCNGroup = getGroup("locale-zh-cn")
		const enUSGroup = getGroup("locale-en-us")

		expect(zhCNGroup.test("/project/src/assets/locales/en_US/common.json")).toBe(false)
		expect(enUSGroup.test("/project/src/assets/locales/zh_CN/common.json")).toBe(false)
		expect(zhCNGroup.test("/project/src/assets/locales/zh_CN/readme.ts")).toBe(false)
		expect(zhCNGroup.test("/project/src/config/common.json")).toBe(false)
	})

	it("groups custom Tabler React icons into one cacheable chunk", () => {
		const group = getGroup("tabler-icons-custom")

		expect(group.entriesAware).toBe(false)
		expect(group.priority).toBe(100)
		expect(group.test("/project/src/enhance/tabler/icons-react/icons/IconMagicLogo.tsx")).toBe(
			true,
		)
		expect(
			group.test(
				"/project/enterprise/src/enhance/tabler/icons-react/icons/IconMagicLogo.tsx",
			),
		).toBe(true)
		expect(group.test("/project/src/enhance/tabler/icons-react/index.ts")).toBe(true)
		expect(group.test("/project/src/enhance/lucide-react/icons/Search.tsx")).toBe(false)
		expect(
			group.test("/project/node_modules/@tabler/icons-react/dist/esm/icons/IconX.js"),
		).toBe(false)
	})

	it("separates static and dynamic Lucide modules into two aggregate chunks", () => {
		const staticGroup = getGroup("lucide-icons-static")
		const dynamicGroup = getGroup("lucide-icons-dynamic")

		expect(staticGroup.entriesAware).toBe(false)
		expect(dynamicGroup.entriesAware).toBe(false)
		expect(
			staticGroup.test(
				"/project/node_modules/lucide-react/dist/esm/icons/search.js?lucide-static",
			),
		).toBe(true)
		expect(
			dynamicGroup.test("/project/node_modules/lucide-react/dist/esm/dynamicIconImports.js"),
		).toBe(true)
		expect(
			dynamicGroup.test("/project/node_modules/lucide-react/dist/esm/DynamicIcon.js"),
		).toBe(true)
		expect(
			dynamicGroup.test("/project/node_modules/lucide-react/dist/esm/icons/search.js"),
		).toBe(false)
		expect(
			dynamicGroup.test(
				"/project/node_modules/lucide-react/dist/esm/icons/search.js?lucide-static",
			),
		).toBe(false)
		expect(
			dynamicGroup.test(
				"/project/node_modules/lucide-react/dist/esm/icons/search.js?lucide-dynamic",
			),
		).toBe(true)
		expect(
			staticGroup.test(
				"/project/node_modules/lucide-react/dist/esm/icons/search.js?lucide-dynamic",
			),
		).toBe(false)
	})
})
