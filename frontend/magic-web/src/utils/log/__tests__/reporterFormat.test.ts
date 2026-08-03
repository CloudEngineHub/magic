import { describe, expect, it } from "vitest"
import { formatLogData } from "../plugins/builtin/ReporterPlugin/ReporterPlugin"
import { LogType, type LogContext } from "../plugins"

const runtimeContext: LogContext = {
	logType: LogType.ERROR,
	namespace: "repository",
	traceId: "trace-1",
	release: "3.10.7",
	data: ["legacy"],
	url: "https://example.com/path",
	info: { cluster: "prod" },
	timestamp: 1,
	metadata: {},
}

describe("ReporterPlugin formatLogData", () => {
	it("adds the APM release to legacy reports without changing their data shape", () => {
		expect(formatLogData(runtimeContext)).toEqual({
			logType: "error",
			traceId: "trace-1",
			release: "3.10.7",
			url: "https://example.com/path",
			info: { cluster: "prod" },
			timestamp: 1,
			namespace: "repository",
			data: ["legacy"],
		})
	})

	it("flattens ErrorReport fields for server-side indexing", () => {
		const result = formatLogData({
			...runtimeContext,
			errorReport: {
				namespace: "repository",
				eventKey: "operation_failed",
				errorKind: "quota",
				error: { name: "Error", message: "quota exceeded" },
				captureSource: "manual",
				eventId: "event-1",
				release: "3.10.7",
			},
		})

		expect(result).toMatchObject({
			namespace: "repository",
			eventKey: "operation_failed",
			errorKind: "quota",
			eventId: "event-1",
			release: "3.10.7",
			traceId: "trace-1",
		})
		expect(result).not.toHaveProperty("data")
	})
})
