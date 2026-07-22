import type { UploadFileResponse } from "../../../public/magic-types"
import {
	CANVAS_RESOURCE_ROOTS,
	buildVirtualResourceScope,
	formatCanvasRelativeResourcePath,
	getCanonicalResourcePathInfo as getCanonicalResourcePathInfoInternal,
	hasCurrentDirectoryPrefix,
	isCanvasRelativeResourcePath as isCanvasRelativeResourcePathInternal,
	isRemoteOrSpecialPath,
	joinUploadStoragePath as joinUploadStoragePathInternal,
	normalizePathSeparators,
	normalizeUploadFileResponse as normalizeUploadFileResponseInternal,
	normalizeUploadResultPath as normalizeUploadResultPathInternal,
	toWeakCanvasResourcePath as toWeakCanvasResourcePathInternal,
	stripCurrentDirectoryPrefix,
	stripPathEdgeSlashes,
	type CanonicalResourcePathInfo,
} from "./internal/pathPrimitives"

export {
	CANVAS_RESOURCE_ROOTS,
	buildVirtualResourceScope,
	formatCanvasRelativeResourcePath,
	hasCurrentDirectoryPrefix,
	isRemoteOrSpecialPath,
	normalizePathSeparators,
	stripCurrentDirectoryPrefix,
	stripPathEdgeSlashes,
}

export type CanvasResourcePathInfo = CanonicalResourcePathInfo

export function isCanvasResourceRootPath(path: string): boolean {
	return isCanvasRelativeResourcePathInternal(path)
}

export function toWeakCanvasResourcePath(path: string): string {
	const normalized = toWeakCanvasResourcePathInternal(path)
	const withoutCurrentDirectoryPrefix = stripCurrentDirectoryPrefix(normalized)
	if (
		withoutCurrentDirectoryPrefix !== normalized &&
		isCanvasResourceRootPath(withoutCurrentDirectoryPrefix)
	) {
		return withoutCurrentDirectoryPrefix
	}
	return normalized
}

export function getCanvasResourcePathInfo(
	path: string,
	resolveAbsolutePath?: (path: string) => string,
): CanvasResourcePathInfo {
	const info = getCanonicalResourcePathInfoInternal(path, resolveAbsolutePath)
	if (info.usedResolveAbsolutePath) {
		return info
	}

	const canonicalPath = toWeakCanvasResourcePath(path)
	if (canonicalPath === info.canonicalPath && canonicalPath === info.weakPath) {
		return info
	}

	return {
		...info,
		weakPath: canonicalPath,
		canonicalPath,
		canonicalChanged: info.rawPath !== canonicalPath,
	}
}

export function toCanonicalCanvasResourcePath(
	path: string,
	resolveAbsolutePath?: (path: string) => string,
): string {
	return getCanvasResourcePathInfo(path, resolveAbsolutePath).canonicalPath
}

export function areCanvasResourcePathsSame(
	a: string,
	b: string,
	resolveAbsolutePath?: (path: string) => string,
): boolean {
	return (
		toCanonicalCanvasResourcePath(a, resolveAbsolutePath) ===
		toCanonicalCanvasResourcePath(b, resolveAbsolutePath)
	)
}

export function toCanvasUploadStoragePath(fileDir: string, fileName: string): string {
	return joinUploadStoragePathInternal(fileDir, fileName)
}

export function normalizeCanvasUploadStoragePath(path: string): string {
	return normalizeUploadResultPathInternal(path)
}

export function normalizeCanvasUploadFileResponsePath<T extends Pick<UploadFileResponse, "path">>(
	result: T,
): T {
	return normalizeUploadFileResponseInternal(result)
}

export function toRemoteLoadDeferralKey(path?: string | null): string | null {
	const rawPath = path?.trim()
	if (!rawPath || isRemoteOrSpecialPath(rawPath)) {
		return null
	}

	const key = stripCurrentDirectoryPrefix(toWeakCanvasResourcePath(rawPath))
	if (!key || key === ".") {
		return null
	}
	return key
}

export function getCanvasResourceFileName(rawPath: string | null | undefined): string {
	const trimmed = rawPath?.trim() ?? ""
	if (!trimmed) return ""
	const withoutQuery = trimmed.split(/[?#]/)[0] ?? ""
	const pathname = (() => {
		try {
			return new URL(withoutQuery).pathname
		} catch {
			return withoutQuery
		}
	})()
	return pathname.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? ""
}

export function toReferenceResourcePathCandidates(
	path: string,
	options?: { resolveResourcePathCandidates?: (path: string) => string[] },
): string[] {
	const candidates = new Set<string>()
	const addExactCandidate = (candidate: string) => {
		const normalized = normalizePathSeparators(candidate.trim())
		if (!normalized) return
		candidates.add(normalized)
	}
	const addLegacyCompatibleCandidate = (candidate: string) => {
		addExactCandidate(candidate)
		const normalized = normalizePathSeparators(candidate.trim())
		if (!normalized) return

		const withoutCurrentDirectoryPrefix = normalized.replace(/^\.\/+/, "")
		if (withoutCurrentDirectoryPrefix !== normalized) {
			candidates.add(withoutCurrentDirectoryPrefix)
		}

		if (isCanvasResourceRootPath(withoutCurrentDirectoryPrefix)) {
			candidates.add(`./${withoutCurrentDirectoryPrefix}`)
		}
	}

	const trimmedPath = path.trim()
	if (!trimmedPath) return []

	const resolveHostCandidates = options?.resolveResourcePathCandidates
	if (!resolveHostCandidates) {
		// 没有宿主路径语意时，保留旧的 `./images` / `images` 兼容匹配。
		addLegacyCompatibleCandidate(trimmedPath)
		return Array.from(candidates)
	}

	// 宿主已掌握附件与画布上下文；其返回值是唯一允许补充的同一资源路径。
	// 这能避免歧义历史裸路径被这里重新猜成 `./images/...`。
	addExactCandidate(trimmedPath)
	resolveHostCandidates(trimmedPath).forEach(addExactCandidate)

	return Array.from(candidates)
}
