import { useMemo } from "react"
import { useMemoizedFn } from "ahooks"
import { detectContentTypeRender } from "../../Detail/components/FilesViewer/utils/preview"
import type { FileItem } from "../../Detail/components/FilesViewer/types"
import { DetailType } from "../../Detail/types"
import { createAICardTreeNavigationIndex } from "../../Detail/components/AICardRootRender/utils/aiCardTreeNavigation"
import type { AttachmentItem } from "./types"

interface UseAICardTreeNavigationOptions {
    attachments: AttachmentItem[]
    findFileInTree: (fileId: string) => AttachmentItem | undefined
    onFileClick?: (fileItem: any) => void
    setUserSelectDetail?: (detail: any) => void
}

export function useAICardTreeNavigation({
    attachments,
    findFileInTree,
    onFileClick,
    setUserSelectDetail,
}: UseAICardTreeNavigationOptions) {
    const navigationIndex = useMemo(
        () => createAICardTreeNavigationIndex(attachments as unknown as any[]),
        [attachments],
    )

    /** Open ai-card root when clicking a card sub-folder row. */
    const tryOpenAICardFromSubFolder = useMemoizedFn((item: AttachmentItem): boolean => {
        if (!attachments?.length) return false
        const resolution = navigationIndex.resolveCardFolderClick({
            ...item,
            display_config: item.display_config,
        })
        const nav = resolution?.navigationTarget
        if (!nav) return false
        const root = findFileInTree(nav.rootFolderFileId)
        if (!root?.file_id) return false
        const fileItem: FileItem = {
            file_id: root.file_id,
            file_name: root.file_name || root.name || "",
            display_filename: root.name || root.file_name,
            is_directory: root.is_directory,
            children: root.children as FileItem[] | undefined,
            display_config: root.display_config,
            file_extension: root.file_extension,
            file_size: root.file_size,
        }
        const contentTypeConfig = detectContentTypeRender(fileItem)
        if (!contentTypeConfig || contentTypeConfig.detailType !== DetailType.AICard) {
            return false
        }
        const transformedData = contentTypeConfig.dataTransformer
            ? contentTypeConfig.dataTransformer(fileItem)
            : fileItem
        const rootDetailData = {
            ...root,
            ...transformedData,
            file_id: root.file_id,
            file_name: root.name || root.file_name,
            display_config: root.display_config,
            initialNavigation: {
                activeCardId: nav.activeCardId,
                initialView: "detail" as const,
            },
        }
        if (onFileClick && root.file_id) onFileClick(rootDetailData)
        setUserSelectDetail?.({
            type: contentTypeConfig.detailType,
            data: rootDetailData,
            currentFileId: root.file_id,
            attachments,
        })
        return true
    })

    return {
        tryOpenAICardFromSubFolder,
    }
}
