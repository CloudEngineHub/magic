import { useMemo, type ReactNode } from "react"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import { HtmlAppPermissionContext } from "@/pages/superMagic/components/Detail/contents/HTML/hooks/HtmlAppPermissionContext"
import { useHtmlAppPermissions } from "@/pages/superMagic/components/Detail/contents/HTML/hooks/useHtmlAppPermissions"

export default function MicroAppPermissionsProvider({
	projectId,
	attachmentList,
	children,
}: {
	projectId: string
	attachmentList: AttachmentItem[]
	children: ReactNode
}) {
	const fileList = useMemo(
		() =>
			attachmentList
				.filter((file) => !file.is_directory)
				.map((file) => ({
					file_id: file.file_id || "",
					relative_file_path: file.relative_file_path || file.file_name || "",
					updated_at: file.updated_at,
				})),
		[attachmentList],
	)
	// A MicroApp owns one root manifest and authorization identity. Every HTML/JS
	// file revision contributes to its fingerprint, independently of the open tab.
	const controller = useHtmlAppPermissions({
		projectId,
		relativeFilePath: "index.html",
		content: "",
		fileList,
		enabled: Boolean(projectId),
	})
	return (
		<HtmlAppPermissionContext.Provider value={controller}>
			{children}
		</HtmlAppPermissionContext.Provider>
	)
}
