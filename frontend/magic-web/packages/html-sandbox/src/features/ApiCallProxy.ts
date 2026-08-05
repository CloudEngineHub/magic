/**
 * ApiCallProxy
 *
 * Subscribes to the runtime logger hub to intercept structured API call
 * lifecycle events (start → success/failure/timeout) and collects them as
 * ApiCallEntry records. Correlates start/end events by requestId to compute
 * duration and status. The host no longer imports any magic-api code; it only
 * depends on the neutral runtime logger contract.
 */

import {
	runtimeLoggerHub,
	type RuntimeLoggerHub,
	type RuntimeLogRecord,
} from "../runtime/RuntimeLogger"
import { serializeApiResult } from "./serializeApiResult"

export type ApiCallStatus = "pending" | "success" | "error" | "timeout"

export interface ApiCallEntry {
	id: string
	api: string
	event: string
	details?: Record<string, unknown>
	status: ApiCallStatus
	startTime: number
	endTime?: number
	duration?: number
	error?: string
	/** Bounded, structured-clone-safe response value. */
	result?: unknown
	resultTruncated?: boolean
}

type ApiCallEntryListener = (entry: ApiCallEntry) => void

const MAX_ENTRIES = 500

export class ApiCallProxy {
	private enabled = false
	private entries: ApiCallEntry[] = []
	private listener: ApiCallEntryListener | null = null
	/** In-flight calls keyed by requestId */
	private pendingCalls = new Map<string, ApiCallEntry>()
	/** Unsubscribe handle for the logger hub subscription */
	private unsubscribe: (() => void) | null = null

	constructor(private readonly hub: RuntimeLoggerHub = runtimeLoggerHub) {}

	enable(): void {
		if (this.enabled) return
		this.enabled = true
		this.unsubscribe = this.hub.subscribe((record) => {
			this.handleLog(record)
		})
	}

	disable(): void {
		if (!this.enabled) return
		this.enabled = false
		this.unsubscribe?.()
		this.unsubscribe = null
	}

	destroy(): void {
		this.disable()
		this.entries = []
		this.pendingCalls.clear()
	}

	onEntry(listener: ApiCallEntryListener): void {
		this.listener = listener
	}

	getEntries(): ApiCallEntry[] {
		return [...this.entries]
	}

	clear(): void {
		this.entries = []
		this.pendingCalls.clear()
	}

	private handleLog(record: RuntimeLogRecord): void {
		const { source: api, event, details } = record
		const requestId = details?.requestId as string | undefined

		if (event === "request:start" && requestId) {
			const entry: ApiCallEntry = {
				id: `api_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
				api,
				event,
				status: "pending",
				startTime: Date.now(),
			}
			this.applyDetails(entry, details)
			this.pendingCalls.set(requestId, entry)
			this.pushEntry(entry)
			return
		}

		if (
			(event === "request:success" ||
				event === "request:failure" ||
				event === "request:timeout") &&
			requestId
		) {
			const pending = this.pendingCalls.get(requestId)
			if (pending) {
				const endTime = Date.now()
				pending.endTime = endTime
				pending.duration = endTime - pending.startTime
				pending.status =
					event === "request:success"
						? "success"
						: event === "request:timeout"
							? "timeout"
							: "error"
				pending.event = event
				if (details?.error) {
					pending.error = String(details.error)
				}
				this.applyDetails(pending, details)
				this.pendingCalls.delete(requestId)
				// Notify listener with updated entry
				this.listener?.(pending)
			} else {
				// No matching start — create a standalone entry
				const entry: ApiCallEntry = {
					id: `api_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
					api,
					event,
					status:
						event === "request:success"
							? "success"
							: event === "request:timeout"
								? "timeout"
								: "error",
					startTime: Date.now(),
					endTime: Date.now(),
					duration: 0,
					error: details?.error ? String(details.error) : undefined,
				}
				this.applyDetails(entry, details)
				this.pushEntry(entry)
			}
			return
		}

		// Non-request events (e.g. fire-and-forget APIs) — log as standalone
		const entry: ApiCallEntry = {
			id: `api_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
			api,
			event,
			status: "success",
			startTime: Date.now(),
			endTime: Date.now(),
			duration: 0,
		}
		this.applyDetails(entry, details)
		this.pushEntry(entry)
	}

	private applyDetails(entry: ApiCallEntry, details?: Record<string, unknown>): void {
		if (!details) return

		const nextDetails = { ...details }
		if (Object.prototype.hasOwnProperty.call(nextDetails, "result")) {
			const serialized = serializeApiResult(nextDetails.result)
			entry.result = serialized.value
			entry.resultTruncated = serialized.truncated || undefined
			delete nextDetails.result
		}

		if (Object.keys(nextDetails).length > 0) {
			entry.details = { ...entry.details, ...nextDetails }
		}
	}

	private pushEntry(entry: ApiCallEntry): void {
		this.entries.push(entry)
		if (this.entries.length > MAX_ENTRIES) {
			this.entries = this.entries.slice(-MAX_ENTRIES)
		}
		this.listener?.(entry)
	}
}
