export type SessionFileAccess = {
	kind: "session"
	projectId?: string
	topicId?: string
}

export type ShareFileAccess = {
	kind: "share"
	token: string
	projectId: string
	topicId?: string
	resourceId?: string
}

export type FileAccessContext = SessionFileAccess | ShareFileAccess

export function createSessionFileAccess(
	params: {
		projectId?: string
		topicId?: string
	} = {},
): SessionFileAccess {
	return { kind: "session", ...params }
}

export function createShareFileAccess(params: {
	token: string
	projectId: string
	topicId?: string
	resourceId?: string
}): ShareFileAccess {
	return { kind: "share", ...params }
}

export function getShareAccessToken(access?: FileAccessContext | null): string {
	return access?.kind === "share" ? access.token : ""
}

export function isShareFileAccess(access?: FileAccessContext | null): access is ShareFileAccess {
	return access?.kind === "share"
}

export function isSharePageLocation(
	pathname = typeof window === "undefined" ? "" : window.location.pathname,
): boolean {
	return (
		pathname.includes("/share/") ||
		pathname.includes("/micro-app/") ||
		pathname.includes("magic-share")
	)
}

/** Share routes must not request files until share access is ready. */
export function shouldWaitForShareAccess(
	access?: FileAccessContext | null,
	pathname?: string,
): boolean {
	return isSharePageLocation(pathname) && !isShareFileAccess(access)
}

export function getAccessProjectId(access?: FileAccessContext | null, fallback = ""): string {
	if (access?.kind === "share") return access.projectId
	return access?.projectId || fallback
}

export function getAccessTopicId(access?: FileAccessContext | null, fallback = ""): string {
	if (access?.kind === "share") return access.topicId ?? ""
	return access?.topicId || fallback
}

export function resolveAttachmentProjectId(
	projectId: string,
	access?: FileAccessContext | null,
): string {
	return access?.kind === "share" ? "0" : projectId
}

export function resolveTemporaryTokenFromAccess(
	access?: FileAccessContext | null,
	temporaryToken?: string | null,
): string {
	if (access?.kind === "share") return access.token
	if (temporaryToken === null) return ""
	return temporaryToken || ""
}

/**
 * Canonical identity of a file access context. FileApi instances are memoized on
 * this key instead of the object reference, so a provider that rebuilds an equal
 * access object does not churn every downstream closure. The share token never
 * leaves this in-memory key (it is a useMemo dependency, not a log or URL).
 */
export function getFileAccessIdentityKey(access?: FileAccessContext | null): string {
	if (!access) return "none"
	if (access.kind === "share") {
		return [
			"share",
			access.token,
			access.projectId,
			access.topicId ?? "",
			access.resourceId ?? "",
		].join(":")
	}
	return ["session", access.projectId ?? "", access.topicId ?? ""].join(":")
}
