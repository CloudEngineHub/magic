import { getTemporaryDownloadUrl } from "@/pages/superMagic/utils/api"
import type { GetTemporaryDownloadUrlItem } from "@/pages/superMagic/utils/api"
import { useDebounceEffect } from "ahooks"
import { useEffect, useRef, useState } from "react"

export const useFileUrl = ({
	file_id,
	enabled = true,
}: {
	file_id: string
	type?: "preview" | "download"
	enabled?: boolean
}) => {
	const [fileUrl, setFileUrl] = useState<string>("")
	const [isLoading, setIsLoading] = useState(false)
	const [hasError, setHasError] = useState(false)
	const requestIdRef = useRef(0)

	useDebounceEffect(
		() => {
			const requestId = ++requestIdRef.current
			if (!enabled || !file_id) {
				setFileUrl("")
				setIsLoading(false)
				setHasError(false)
				return
			}
			setIsLoading(true)
			setHasError(false)
			getTemporaryDownloadUrl({ file_ids: [file_id] })
				.then((res: GetTemporaryDownloadUrlItem[]) => {
					if (requestIdRef.current !== requestId) return
					const url = res[0]?.url || ""
					setFileUrl(url)
					setHasError(!url)
				})
				.catch(() => {
					if (requestIdRef.current !== requestId) return
					setFileUrl("")
					setHasError(true)
				})
				.finally(() => {
					if (requestIdRef.current === requestId) setIsLoading(false)
				})
		},
		[file_id, enabled],
		{
			wait: 16,
		},
	)

	useEffect(
		() => () => {
			requestIdRef.current += 1
		},
		[],
	)

	return { fileUrl, isLoading, hasError }
}
