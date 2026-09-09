import { describe, expect, it, vi } from "vitest"
import type { ILogger, ILoggerConfig, IProvider, IUserInfo } from "../../../../packages/logger/src"
import { createDeferredTrackLogger } from "../deferred-track-logger"

function createLoggerStub() {
	const provider: IProvider = {
		init: vi.fn(async () => undefined),
		start: vi.fn(),
		stop: vi.fn(),
		setConfig: vi.fn(),
		error: vi.fn(),
		report: vi.fn(),
	}

	const logger: ILogger = {
		init: vi.fn(async () => undefined),
		start: vi.fn(),
		stop: vi.fn(),
		error: vi.fn(),
		report: vi.fn(),
		track: vi.fn(),
		setConfig: vi.fn(),
		setUser: vi.fn(),
		getProvider: vi.fn(() => provider),
	}

	return { logger, provider }
}

const config: ILoggerConfig = {
	provider: {
		type: "Volcengine",
		appId: "app-id",
		token: "secret-token",
	},
}

describe("createDeferredTrackLogger", () => {
	it("does not retain bearer credentials, cookie headers, or quoted token values", async () => {
		const { logger } = createLoggerStub()
		const deferred = createDeferredTrackLogger(logger, config)
		deferred.error(
			new Error(
				'Authorization: Bearer secret-one\nCookie: session=secret-two; other=secret-three\n{"token":"secret-four"}',
			),
		)
		await deferred.initialize()
		const error = vi.mocked(logger.error).mock.calls[0][0] as Error
		expect(error.message).not.toContain("secret-")
		expect(error.stack).not.toContain("secret-")
	})
	it("queues bounded sanitized errors and flushes them after initialization", async () => {
		const { logger } = createLoggerStub()
		const deferred = createDeferredTrackLogger(logger, config)
		const longMessage = `authorization=secret-token ${"x".repeat(2000)}`

		deferred.error({
			kind: "provider-error-input",
			value: new Error(longMessage),
			fallbackMessage: longMessage,
			attributes: {
				namespace: "test",
				eventId: "event-1",
				release: "release-1",
				captureSource: "manual",
			},
		})

		expect(logger.error).not.toHaveBeenCalled()

		await deferred.initialize()

		expect(logger.init).toHaveBeenCalledWith(config)
		expect(logger.error).toHaveBeenCalledTimes(1)
		const queuedInput = vi.mocked(logger.error).mock.calls[0][0] as {
			value: Error
			fallbackMessage: string
		}
		expect(queuedInput.value.message).not.toContain("secret-token")
		expect(queuedInput.value.message.length).toBeLessThanOrEqual(1000)
		expect(queuedInput.fallbackMessage.length).toBeLessThanOrEqual(1000)
	})

	it("applies configuration before flushing queued errors", async () => {
		const { logger } = createLoggerStub()
		const deferred = createDeferredTrackLogger(logger, config)

		deferred.error(new Error("before init"))
		deferred.setConfig({ sessionId: "session-1" })
		await deferred.initialize()

		expect(logger.setConfig).toHaveBeenCalledWith({ sessionId: "session-1" })
		expect(logger.error).toHaveBeenCalledWith(expect.anything())
		expect(
			(vi.mocked(logger.setConfig).mock.invocationCallOrder[0] ?? 0) <
				(vi.mocked(logger.error).mock.invocationCallOrder[0] ?? 0),
		).toBe(true)
	})

	it("drops queued errors when provider initialization fails", async () => {
		const { logger } = createLoggerStub()
		vi.mocked(logger.init).mockRejectedValueOnce(new Error("chunk unavailable"))
		const deferred = createDeferredTrackLogger(logger, config)

		deferred.error(new Error("before init"))
		await expect(deferred.initialize()).resolves.toBeUndefined()

		expect(logger.error).not.toHaveBeenCalled()
	})

	it("keeps at most one hundred queued errors", async () => {
		const { logger } = createLoggerStub()
		const deferred = createDeferredTrackLogger(logger, config)

		for (let index = 0; index < 101; index += 1) {
			deferred.error(new Error(`error-${index}`))
		}
		await deferred.initialize()

		expect(logger.error).toHaveBeenCalledTimes(100)
	})

	it("does not initialize until explicitly requested", () => {
		const { logger } = createLoggerStub()
		const deferred = createDeferredTrackLogger(logger, config)

		expect(logger.init).not.toHaveBeenCalled()
		deferred.setUser({ id: "user-1" } satisfies IUserInfo)
		expect(logger.setUser).not.toHaveBeenCalled()
	})
})
