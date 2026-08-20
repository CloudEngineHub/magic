import { useDebounceEffect } from "ahooks"
import { useEffect, useRef, useState } from "react"
import type { DownloadImageMode } from "../pages/Workspace/types"
import type { ImageProcessOptions } from "@/utils/image-processing"
import { resolveSharedFileUrl } from "@/pages/superMagic/services/sharedFileUrlCache"

export const useFileUrl = ({
	file_id,
	file_version,
	updated_at,
	download_mode,
	is_download,
	image_process,
	enabled = true,
}: {
	file_id: string
	file_version?: number
	updated_at?: string
	download_mode?: DownloadImageMode
	is_download?: boolean
	image_process?: ImageProcessOptions
	/** 保留旧调用方的下载/预览参数契约，当前接口统一获取临时资源地址。 */
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
			resolveSharedFileUrl({
				fileId: file_id,
				fileVersion: file_version,
				updatedAt: updated_at,
				downloadMode: download_mode,
				isDownload: is_download,
				imageProcess: image_process,
			})
				.then((item) => {
					if (requestIdRef.current !== requestId) return
					const url = item?.url || ""
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
		[file_id, file_version, updated_at, download_mode, is_download, image_process, enabled],
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
