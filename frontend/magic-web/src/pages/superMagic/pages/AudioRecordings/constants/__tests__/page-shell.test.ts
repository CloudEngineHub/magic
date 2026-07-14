import { describe, expect, it } from "vitest"
import {
	AUDIO_RECORDINGS_PAGE_SHELL_CLASS,
	AUDIO_RECORDINGS_SHARE_PAGE_SHELL_CLASS,
} from "../page-shell"

describe("audio recording page shell classes", () => {
	it("keeps the owner detail shell card chrome on the main recordings pages", () => {
		expect(AUDIO_RECORDINGS_PAGE_SHELL_CLASS).toContain("rounded-xl")
		expect(AUDIO_RECORDINGS_PAGE_SHELL_CLASS).toContain("border")
	})

	it("removes extra rounded and border chrome from the desktop share shell", () => {
		// The desktop /share route already has its own outer container, so the recording share
		// shell should only provide the white background layer instead of nesting another card.
		expect(AUDIO_RECORDINGS_SHARE_PAGE_SHELL_CLASS).toContain("bg-background")
		expect(AUDIO_RECORDINGS_SHARE_PAGE_SHELL_CLASS).not.toContain("rounded-xl")
		expect(AUDIO_RECORDINGS_SHARE_PAGE_SHELL_CLASS).not.toContain(" border ")
		expect(AUDIO_RECORDINGS_SHARE_PAGE_SHELL_CLASS).not.toContain("shadow")
	})
})
