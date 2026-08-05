import { describe, expect, it } from "vitest"
import { isModeVisibleToCurrentUser, partitionModesByVisibility } from "../modeVisibility"

describe("modeVisibility", () => {
	const visibleMode = { agent: { is_visible: true }, mode: { identifier: "visible" } }
	const legacyMode = { agent: {}, mode: { identifier: "legacy" } }
	const hiddenMode = { agent: { is_visible: false }, mode: { identifier: "hidden" } }

	it("treats only is_visible=false as hidden", () => {
		expect(isModeVisibleToCurrentUser(visibleMode)).toBe(true)
		expect(isModeVisibleToCurrentUser(legacyMode)).toBe(true)
		expect(isModeVisibleToCurrentUser(hiddenMode)).toBe(false)
	})

	it("keeps visible modes in order and moves hidden modes to a separate list", () => {
		expect(partitionModesByVisibility([visibleMode, hiddenMode, legacyMode])).toEqual({
			visibleModes: [visibleMode, legacyMode],
			hiddenModes: [hiddenMode],
		})
	})
})
