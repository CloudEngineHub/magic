import { describe, expect, it, vi } from "vitest"
import type Logger from "../Logger"
import { ErrorCaptureSource } from "../errorReport"
import { ErrorMonitorPlugin } from "../plugins/builtin/ErrorMonitorPlugin"

interface ErrorMonitorHandlers {
	handleUnhandledRejection(event: PromiseRejectionEvent): void
	handleGlobalError(event: ErrorEvent): void
}

function createPluginHarness() {
	const error = vi.fn()
	const report = vi.fn()
	const plugin = new ErrorMonitorPlugin({ throttleInterval: 0 })

	;(plugin as unknown as { logger: Pick<Logger, "error" | "report"> }).logger = {
		error,
		report,
	}

	return {
		error,
		report,
		handlers: plugin as unknown as ErrorMonitorHandlers,
	}
}

describe("ErrorMonitorPlugin", () => {
	it("routes unhandled rejections through the self-hosted error pipeline", () => {
		const { error, report, handlers } = createPluginHarness()
		const reason = new TypeError("promise failed")

		handlers.handleUnhandledRejection({ reason } as PromiseRejectionEvent)

		expect(report).not.toHaveBeenCalled()
		expect(error).toHaveBeenCalledWith(
			{
				namespace: "unhandledRejection",
				data: {
					eventKey: "unhandled_promise_rejection",
					errorKind: "unknown",
					error: reason,
					message: "promise failed",
				},
			},
			undefined,
			{ captureSource: ErrorCaptureSource.GLOBAL },
		)
	})

	it("preserves global error location details in structured context", () => {
		const { error, report, handlers } = createPluginHarness()
		const originalError = new Error("render failed")

		handlers.handleGlobalError({
			message: "Uncaught Error: render failed",
			error: originalError,
			filename: "https://example.com/assets/app.js",
			lineno: 12,
			colno: 8,
		} as ErrorEvent)

		expect(report).not.toHaveBeenCalled()
		expect(error).toHaveBeenCalledWith(
			{
				namespace: "globalError",
				data: {
					eventKey: "global_javascript_error",
					errorKind: "unknown",
					error: originalError,
					message: "Uncaught Error: render failed",
					context: {
						errorInfo: {
							type: "globalError",
							message: "Uncaught Error: render failed",
							stack: expect.any(String),
							filename: "https://example.com/assets/app.js",
							lineno: 12,
							colno: 8,
							error: originalError,
							timestamp: expect.any(Number),
						},
					},
				},
			},
			undefined,
			{ captureSource: ErrorCaptureSource.GLOBAL },
		)
	})
})
