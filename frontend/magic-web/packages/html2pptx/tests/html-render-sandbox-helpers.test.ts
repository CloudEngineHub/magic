// @vitest-environment jsdom

import { describe, expect, it } from "vitest"
import { requiresNativeLoadWait } from "../src/sandbox/htmlRenderSandbox.helpers"

describe("native-load readiness classification", () => {
	it("does not add a fixed grace period to static HTML", () => {
		expect(
			requiresNativeLoadWait(
				"<!doctype html><html><head><style>.title{font-size:20px}</style></head><body><div class=title>text</div></body></html>",
			),
		).toBe(false)
	})

	it("keeps the grace period for executable or asynchronous pages", () => {
		expect(requiresNativeLoadWait("<html><body><script>draw()</script></body></html>")).toBe(
			true,
		)
		expect(
			requiresNativeLoadWait(
				'<html><head><link rel="stylesheet" href="theme.css"></head><body></body></html>',
			),
		).toBe(true)
		expect(requiresNativeLoadWait("<html><body><canvas></canvas></body></html>")).toBe(true)
		expect(requiresNativeLoadWait('<html data-render-ready="true"><body></body></html>')).toBe(
			true,
		)
		expect(requiresNativeLoadWait('<html><body onpageshow="hydrate()"></body></html>')).toBe(
			true,
		)
		expect(requiresNativeLoadWait('<html><body><img onabort="retry()"></body></html>')).toBe(
			true,
		)
		expect(
			requiresNativeLoadWait(
				'<html><body><svg><image href="https://assets.example.test/chart.png"></image></svg></body></html>',
			),
		).toBe(true)
		expect(
			requiresNativeLoadWait(
				'<html><body><svg><use xlink:href="https://assets.example.test/icons.svg#check"></use></svg></body></html>',
			),
		).toBe(true)
	})

	it("allows resource-specific image readiness to replace the fixed delay", () => {
		expect(requiresNativeLoadWait('<html><body><img src="image.png"></body></html>')).toBe(
			false,
		)
	})
})
