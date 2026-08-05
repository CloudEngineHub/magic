import { describe, expect, it } from "vitest"
import type { PlatformPackage } from "@admin/types/platformPackage"
import { buildDefaultAgentOptions, getModeDisplayName } from "../defaultAgent"

function createMode(
	identifier: string,
	status: boolean,
	name_i18n: Partial<PlatformPackage.Mode["name_i18n"]> = {},
	isDefault: 1 | 0 = 0,
) {
	return {
		identifier,
		status,
		name_i18n,
		is_default: isDefault,
	} as PlatformPackage.Mode
}

describe("defaultAgent", () => {
	it("only includes enabled official modes", () => {
		const enabled = createMode("general", true, { zh_CN: "超级麦吉" })
		const disabled = createMode("ppt", false, { zh_CN: "PPT 制作专家" })

		expect(buildDefaultAgentOptions([enabled, disabled])).toEqual([
			{ label: "超级麦吉 (general)", value: "general" },
		])
	})

	it("uses the identifier when a mode name is missing", () => {
		const mode = createMode("general", true)

		expect(getModeDisplayName(mode)).toBe("general")
		expect(buildDefaultAgentOptions([mode])).toEqual([
			{ label: "general (general)", value: "general" },
		])
	})

	it("excludes the system default mode", () => {
		const systemDefault = createMode("default", true, { zh_CN: "默认模式" }, 1)
		const general = createMode("general", true, { zh_CN: "超级麦吉" })

		expect(buildDefaultAgentOptions([systemDefault, general])).toEqual([
			{ label: "超级麦吉 (general)", value: "general" },
		])
	})

	it("does not restore the current system default mode as a disabled option", () => {
		const systemDefault = createMode("default", true, { zh_CN: "默认模式" }, 1)

		expect(buildDefaultAgentOptions([systemDefault], "default")).toEqual([])
	})

	it("keeps the current server value visible when it is absent from the enabled list", () => {
		expect(buildDefaultAgentOptions([], "legacy-agent")).toEqual([
			{ label: "legacy-agent", value: "legacy-agent", disabled: true },
		])
	})
})
