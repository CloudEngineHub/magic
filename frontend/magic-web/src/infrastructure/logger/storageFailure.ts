import { logger } from "@/infrastructure/logger"

/** Query this eventKey for every origin-quota-exceeded signal. */
export const STORAGE_QUOTA_EXCEEDED_EVENT_KEY = "storage_quota_exceeded"
/** Shared errorKind for quota-exceeded logger.error and logger.report. */
export const STORAGE_QUOTA_EXCEEDED_ERROR_KIND = "quota"
/** Same tab, same event: at most one cloud quota report inside this window. */
export const STORAGE_QUOTA_REPORT_COOLDOWN_MS = 3 * 60 * 60 * 1000
/** sessionStorage flag prefix; value is a timestamp only, never usage or keys. */
export const STORAGE_QUOTA_REPORT_SESSION_KEY_PREFIX = "mw.sq."
/** Legacy DOMException.code for quota errors (WebKit / older browsers). */
const LEGACY_QUOTA_ERROR_CODE = 22
/** Firefox nsresult mapped onto DOMException.code for quota errors. */
const FIREFOX_QUOTA_ERROR_CODE = 1014
/** Page-local gate for quota-exceeded reports emitted from storage wrappers. */
const wrapperQuotaReportsThisPage = new Set<string>()

const storageLogger = logger.createLogger("webStorage")

export interface CaughtStorageFailure {
	eventKey: string
	error: unknown
	message: string
	/** Product storage key name only; never the stored value. */
	key?: string
}

/** Identify QuotaExceededError across Chromium, legacy WebKit codes, and Firefox names. */
export function isQuotaExceeded(error: unknown): boolean {
	if (!error || typeof error !== "object") return false
	const name = "name" in error ? String(error.name) : ""
	const code = "code" in error ? Number(error.code) : Number.NaN
	return (
		name === "QuotaExceededError" ||
		name === "NS_ERROR_DOM_QUOTA_REACHED" ||
		code === LEGACY_QUOTA_ERROR_CODE ||
		code === FIREFOX_QUOTA_ERROR_CODE
	)
}

/**
 * Allow one report per event per page, and at most one per tab inside 3 hours.
 * A later refresh can report again only after the cooldown has elapsed.
 */
export function claimStorageQuotaReport(eventKey: string, reportedThisPage: Set<string>): boolean {
	if (reportedThisPage.has(eventKey)) return false
	const storageKey = `${STORAGE_QUOTA_REPORT_SESSION_KEY_PREFIX}${eventKey}`
	const now = Date.now()
	try {
		const last = Number(sessionStorage.getItem(storageKey))
		if (Number.isFinite(last) && last > 0 && now - last < STORAGE_QUOTA_REPORT_COOLDOWN_MS) {
			return false
		}
	} catch {
		// sessionStorage unavailable: still gate to once per page via reportedThisPage.
	}
	reportedThisPage.add(eventKey)
	try {
		sessionStorage.setItem(storageKey, String(now))
	} catch {
		// Ignore write failures; the in-memory gate already recorded this page.
	}
	return true
}

/** Record a caught Web Storage failure without leaking values, and sample quota-exceeded once. */
export function reportCaughtStorageFailure(failure: CaughtStorageFailure): void {
	const quota = isQuotaExceeded(failure.error)
	const context = {
		...(failure.key ? { key: failure.key } : {}),
		...(quota ? { source: failure.eventKey } : {}),
	}
	storageLogger.error({
		// Quota writes share one query key; the wrapper name stays in context.source.
		eventKey: quota ? STORAGE_QUOTA_EXCEEDED_EVENT_KEY : failure.eventKey,
		errorKind: quota ? STORAGE_QUOTA_EXCEEDED_ERROR_KIND : "storage",
		error: failure.error,
		message: failure.message,
		context: Object.keys(context).length > 0 ? context : undefined,
	})
	if (!quota) return
	if (!claimStorageQuotaReport(STORAGE_QUOTA_EXCEEDED_EVENT_KEY, wrapperQuotaReportsThisPage))
		return
	logger.report({
		namespace: "storageQuota",
		data: {
			eventKey: STORAGE_QUOTA_EXCEEDED_EVENT_KEY,
			errorKind: STORAGE_QUOTA_EXCEEDED_ERROR_KIND,
		},
	})
}

/** Clear wrapper-side quota gates so Vitest files do not leak claims across cases. */
export function resetCaughtStorageFailureGateForTests(): void {
	wrapperQuotaReportsThisPage.clear()
}
