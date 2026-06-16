import { useMemo } from "react"
import { useMemoizedFn } from "ahooks"
import { detectContentTypeRender } from "../../Detail/components/FilesViewer/utils/preview"
import type { FileItem } from "../../Detail/components/FilesViewer/types"
import { DetailType } from "../../Detail/types"
import type { AttachmentNode } from "../../Detail/components/SelfMediaRootRender/services/selfMediaHelpers"
import { createSelfMediaTreeNavigationIndex } from "../../Detail/components/SelfMediaRootRender/utils/selfMediaTreeNavigation"
import type { AttachmentItem } from "./types"

interface UseSelfMediaTreeNavigationOptions {
    attachments: AttachmentItem[]
    findFileInTree: (fileId: string) => AttachmentItem | undefined
    onFileClick?: (fileItem: any) => void
    setUserSelectDetail?: (detail: any) => void
}

export function useSelfMediaTreeNavigation({
    attachments,
    findFileInTree,
    onFileClick,
    setUserSelectDetail,
}: UseSelfMediaTreeNavigationOptions) {
    const navigationIndex = useMemo(
        () => createSelfMediaTreeNavigationIndex(attachments as unknown as AttachmentNode[]),
        [attachments],
    )

    /** Open self-media root when clicking the exact `posts/<id>` folder row. */
    const tryOpenSelfMediaFromPostRootFolder = useMemoizedFn((item: AttachmentItem): boolean => {
        if (!attachments?.length) return false
        const resolution = navigationIndex.resolvePostRootFolderClick({
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
        if (!contentTypeConfig || contentTypeConfig.detailType !== DetailType.SelfMedia) {
            return false
        }
        const transformedData = contentTypeConfig.dataTransformer
            ? contentTypeConfig.dataTransformer(fileItem)
            : fileItem
        const platformGuess = resolution.targetPlatform
        const rootDetailData = {
            ...root,
            ...transformedData,
            file_id: root.file_id,
            file_name: root.name || root.file_name,
            display_config: root.display_config,
            initialNavigation: {
                activePostId: nav.activePostId,
                initialView: "detail" as const,
                ...(platformGuess ? { activePlatform: platformGuess } : {}),
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

    /** Resolve folder icon platform for a tree node (used in folder row rendering). */
    const resolveNodeFolderIconPlatform = useMemoizedFn((item: AttachmentItem) => {
        if (!attachments?.length) return null
        const { folderIconPlatform } = navigationIndex.resolveNode({
            ...item,
            display_config: item.display_config,
        })
        return folderIconPlatform
    })

    return {
        tryOpenSelfMediaFromPostRootFolder,
        resolveNodeFolderIconPlatform,
    }
}
