import { describe, expect, it } from "vitest"
import { INSPECTOR_HANDLER_SCRIPT } from "../inspectorHandlerScript"

describe("INSPECTOR_HANDLER_SCRIPT", () => {
	it("is valid JavaScript and reports structured element identity", () => {
		expect(() => new Function(INSPECTOR_HANDLER_SCRIPT)).not.toThrow()
		expect(INSPECTOR_HANDLER_SCRIPT).toContain("resource: getElementResource(el)")
		expect(INSPECTOR_HANDLER_SCRIPT).toContain("domContext: getDomContext(el)")
		expect(INSPECTOR_HANDLER_SCRIPT).toContain("elementHtml: sanitizeOuterHTML(el)")
		expect(INSPECTOR_HANDLER_SCRIPT).toContain("selectorMatchCount: selectorMatchCount")
	})
})
