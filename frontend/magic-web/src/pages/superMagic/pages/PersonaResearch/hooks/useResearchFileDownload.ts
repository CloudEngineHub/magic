import { useMemoizedFn } from "ahooks"
import { useFileApi } from "@/pages/superMagic/fileAccess/fileApi"
import { downloadFileWithAnchor } from "@/pages/superMagic/utils/handleFIle"

/**
 * Downloads a research project file. The signed URL is requested at click time and never kept,
 * because temporary download links expire.
 */
export function useResearchFileDownload() {
	const fileApi = useFileApi()
	return useMemoizedFn((fileId: string | undefined) => {
		if (!fileId) return
		void fileApi
			.getTemporaryDownloadUrl({ file_ids: [fileId], is_download: true })
			.then((res: Array<{ url?: string }>) => downloadFileWithAnchor(res[0]?.url))
			.catch((error: unknown) => console.error("Failed to download research file:", error))
	})
}
