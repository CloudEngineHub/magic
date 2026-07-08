import { describe, it, expect, beforeEach, afterEach } from "vitest"
import {
	getPreludeVersion,
	markPreludeVersion,
	isStaleDocument,
} from "../prelude-runtime-context"

describe("prelude-runtime-context", () => {
	let originalVersion: number | undefined

	beforeEach(() => {
		originalVersion = (window as any).__MAGIC_API_PRELUDE_VERSION__
	})

	afterEach(() => {
		if (originalVersion === undefined) {
			delete (window as any).__MAGIC_API_PRELUDE_VERSION__
		} else {
			;(window as any).__MAGIC_API_PRELUDE_VERSION__ = originalVersion
		}
	})

	it("getPreludeVersion() returns undefined before markPreludeVersion is called", () => {
		expect(getPreludeVersion()).toBeUndefined()
	})

	it("markPreludeVersion() sets the version and getPreludeVersion() returns it", () => {
		markPreludeVersion(42)
		expect(getPreludeVersion()).toBe(42)
	})

	it("isStaleDocument() returns false when installedVersion is undefined (unit-test mode)", () => {
		;(window as any).__MAGIC_API_PRELUDE_VERSION__ = 99
		expect(isStaleDocument(undefined)).toBe(false)
	})

	it("isStaleDocument() returns false when versions match", () => {
		;(window as any).__MAGIC_API_PRELUDE_VERSION__ = 5
		expect(isStaleDocument(5)).toBe(false)
	})

	it("isStaleDocument() returns true when window version has advanced past installed version", () => {
		;(window as any).__MAGIC_API_PRELUDE_VERSION__ = 3
		expect(isStaleDocument(2)).toBe(true)
	})

	it("isStaleDocument() returns false when __MAGIC_API_PRELUDE_VERSION__ is not set", () => {
		delete (window as any).__MAGIC_API_PRELUDE_VERSION__
		expect(isStaleDocument(1)).toBe(false)
	})
})
