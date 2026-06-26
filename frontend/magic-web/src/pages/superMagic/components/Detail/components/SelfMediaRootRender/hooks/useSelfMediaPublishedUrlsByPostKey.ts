import { useEffect, useMemo, useRef, useState } from "react"
import type { SelfMediaPlatformPostItem } from "../stores/SelfMediaStore"
import type { SelfMediaPostOpsArtifacts } from "../services/selfMediaOpsArtifactStates"
import { getSelfMediaPostKey } from "../services/selfMediaOpsOverview"

interface UseSelfMediaPublishedUrlsByPostKeyParams {
	posts: SelfMediaPlatformPostItem[]
	artifactsByPostKey: Map<string, SelfMediaPostOpsArtifacts>
	opsArtifactStateSignature: string
	onLoadPublishedUrl?: (
		target: SelfMediaPlatformPostItem,
	) => Promise<string | undefined> | string | undefined
}

export function useSelfMediaPublishedUrlsByPostKey({
	posts,
	artifactsByPostKey,
	opsArtifactStateSignature,
	onLoadPublishedUrl,
}: UseSelfMediaPublishedUrlsByPostKeyParams) {
	const publishedUrlsRef = useRef(new Map<string, string>())
	const requestedSignaturesRef = useRef(new Map<string, string>())
	const mountedRef = useRef(true)
	const [publishedUrlsByPostKey, setPublishedUrlsByPostKey] = useState(
		() => new Map<string, string>(),
	)
	const postKeysSignature = useMemo(() => posts.map(getSelfMediaPostKey).join("|"), [posts])

	useEffect(() => {
		return () => {
			mountedRef.current = false
		}
	}, [])

	useEffect(() => {
		const currentPostKeys = new Set(posts.map(getSelfMediaPostKey))
		let changed = false
		publishedUrlsRef.current.forEach((_url, postKey) => {
			if (currentPostKeys.has(postKey)) return
			publishedUrlsRef.current.delete(postKey)
			changed = true
		})
		requestedSignaturesRef.current.forEach((_signature, postKey) => {
			if (!currentPostKeys.has(postKey)) requestedSignaturesRef.current.delete(postKey)
		})
		if (changed) setPublishedUrlsByPostKey(new Map(publishedUrlsRef.current))
	}, [postKeysSignature, posts])

	useEffect(() => {
		if (!onLoadPublishedUrl) return

		posts.forEach((item) => {
			const postKey = getSelfMediaPostKey(item)
			const artifacts = artifactsByPostKey.get(postKey)
			if (artifacts?.source) return
			if (publishedUrlsRef.current.has(postKey)) return
			const requestSignature = `${postKey}:${opsArtifactStateSignature}`
			if (requestedSignaturesRef.current.get(postKey) === requestSignature) return

			requestedSignaturesRef.current.set(postKey, requestSignature)
			void Promise.resolve(onLoadPublishedUrl(item))
				.then((url) => {
					const trimmedUrl = url?.trim()
					if (!mountedRef.current || !trimmedUrl) return
					publishedUrlsRef.current.set(postKey, trimmedUrl)
					setPublishedUrlsByPostKey(new Map(publishedUrlsRef.current))
				})
				.catch(() => undefined)
		})
	}, [artifactsByPostKey, onLoadPublishedUrl, opsArtifactStateSignature, posts])

	return publishedUrlsByPostKey
}
