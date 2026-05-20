import { useState, useRef, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { useDebounceFn, useUpdateEffect } from "ahooks"
import type { InputRef } from "antd"
import type { AttachmentItem } from "./types"
import { AttachmentSource } from "./types"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import { validateFilename } from "@/utils/filename-validator"
import { checkDuplicateFileName } from "../utils/checkDuplicateFileName"

interface VirtualSelfMediaProjectItem {
    id: string
    name: string
    parentPath?: string
    isVirtual: true
    is_directory: true
}

interface UseVirtualSelfMediaProjectOptions {
    attachments: AttachmentItem[]
    setExpandedKeys: (expandedKeys: React.Key[]) => void
    expandedKeys: React.Key[]
    onSelfMediaProjectCreate?: (
        folderName: string,
        parentPath?: string,
    ) => Promise<{ file_id?: string; id?: string } | undefined>
    onAttachmentsChange?: (attachments: AttachmentItem[]) => void
}

// 工具函数：将新文件夹添加到attachments的正确位置
const addFolderToAttachments = (
    attachments: AttachmentItem[],
    newFolder: AttachmentItem,
    parentPath?: string,
): AttachmentItem[] => {
    if (!parentPath) {
        return [newFolder, ...attachments]
    }

    const addToFolder = (items: AttachmentItem[]): AttachmentItem[] => {
        return items.map((item) => {
            if (item.is_directory && "children" in item) {
                const folderPath = item.relative_file_path || `/${item.name}`
                if (folderPath === parentPath) {
                    return {
                        ...item,
                        children: [newFolder, ...(item.children || [])],
                    }
                }
                return {
                    ...item,
                    children: addToFolder(item.children || []),
                }
            }
            return item
        })
    }

    return addToFolder(attachments)
}

/**
 * useVirtualSelfMediaProject - 处理虚拟自媒体项目创建功能
 */
export function useVirtualSelfMediaProject(options: UseVirtualSelfMediaProjectOptions) {
    const { t } = useTranslation("super")
    const { attachments, setExpandedKeys, expandedKeys } = options
    const [virtualSelfMediaProject, setVirtualSelfMediaProject] =
        useState<VirtualSelfMediaProjectItem | null>(null)
    const [editingVirtualId, setEditingVirtualId] = useState<string | null>(null)
    const [virtualSelfMediaProjectName, setVirtualSelfMediaProjectName] = useState("")
    const [errorMessage, setErrorMessage] = useState("")
    const virtualInputRef = useRef<InputRef>(null)
    const hasFocusedRef = useRef(false)
    const submittedVirtualIdsRef = useRef<Set<string>>(new Set())

    const focusAndSelectFolderName = (inputRef: InputRef) => {
        inputRef.focus()
        inputRef.setSelectionRange(0, virtualSelfMediaProjectName.length)
        hasFocusedRef.current = true
    }

    useEffect(() => {
        if (editingVirtualId && !hasFocusedRef.current) {
            const focusTimer = setTimeout(() => {
                if (virtualInputRef.current) {
                    const input = virtualInputRef.current
                    const inputElement = input.input
                    const isVisible = inputElement && inputElement.offsetParent !== null
                    if (!isVisible) {
                        setTimeout(() => {
                            if (virtualInputRef.current) {
                                focusAndSelectFolderName(virtualInputRef.current)
                            }
                        }, 200)
                        return
                    }
                    focusAndSelectFolderName(input)
                }
            }, 100)
            return () => clearTimeout(focusTimer)
        } else if (!editingVirtualId) {
            hasFocusedRef.current = false
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editingVirtualId, virtualSelfMediaProjectName.length])

    useUpdateEffect(() => {
        if (errorMessage && editingVirtualId && virtualInputRef.current) {
            const focusTimer = setTimeout(() => {
                if (virtualInputRef.current) {
                    focusAndSelectFolderName(virtualInputRef.current)
                }
            }, 100)
            return () => clearTimeout(focusTimer)
        }
    }, [errorMessage])

    const createVirtualSelfMediaProject = (key?: string, parentPath?: string) => {
        if (editingVirtualId || virtualSelfMediaProject) {
            return
        }

        if (key && setExpandedKeys) {
            setExpandedKeys([...expandedKeys, key])
        }

        const defaultName = t("topicFiles.contextMenu.newSelfMedia.defaultName")

        const newVirtualProject: VirtualSelfMediaProjectItem = {
            id: `virtual_self_media_project_${Date.now()}`,
            name: defaultName,
            isVirtual: true,
            is_directory: true,
            parentPath,
        }

        setVirtualSelfMediaProject(newVirtualProject)
        setEditingVirtualId(newVirtualProject.id)
        setVirtualSelfMediaProjectName(defaultName)
        setErrorMessage("")
    }

    const clearVirtualSelfMediaProject = () => {
        setVirtualSelfMediaProject(null)
        setEditingVirtualId(null)
        setVirtualSelfMediaProjectName("")
        setErrorMessage("")
    }

    const confirmVirtualSelfMediaProject = async () => {
        if (!editingVirtualId || !virtualSelfMediaProject) return
        if (submittedVirtualIdsRef.current.has(editingVirtualId)) return

        const trimmedName = virtualSelfMediaProjectName.trim()

        if (!trimmedName) {
            cancelVirtualSelfMediaProject()
            return
        }

        const validationResult = validateFilename(trimmedName, true, { t })
        if (!validationResult.isValid) {
            setErrorMessage("")
            setTimeout(() => {
                setErrorMessage(validationResult.errorMessage || "文件夹名称格式不正确")
            }, 0)
            return
        }

        if (checkDuplicateFileName(trimmedName, attachments, virtualSelfMediaProject.parentPath)) {
            setErrorMessage("")
            setTimeout(() => {
                setErrorMessage(t("topicFiles.contextMenu.newFolder.duplicateError"))
            }, 0)
            return
        }

        submittedVirtualIdsRef.current.add(editingVirtualId)

        try {
            const result = await options.onSelfMediaProjectCreate?.(
                trimmedName,
                virtualSelfMediaProject.parentPath,
            )

            if (options.onAttachmentsChange && result) {
                const realFolder: AttachmentItem = {
                    file_id: result.file_id || result.id,
                    name: trimmedName,
                    path: trimmedName,
                    type: "folder",
                    is_directory: true,
                    children: [],
                    source: AttachmentSource.PROJECT_DIRECTORY,
                }

                const updatedAttachments = addFolderToAttachments(
                    attachments,
                    realFolder,
                    virtualSelfMediaProject.parentPath,
                )

                options.onAttachmentsChange(updatedAttachments)
            } else {
                pubsub.publish(PubSubEvents.Update_Attachments)
            }

            clearVirtualSelfMediaProject()
        } catch (error) {
            submittedVirtualIdsRef.current.delete(editingVirtualId)
            setErrorMessage("创建自媒体项目失败，请重试")
        }
    }

    const { run: debouncedConfirmVirtualSelfMediaProject } = useDebounceFn(
        confirmVirtualSelfMediaProject,
        { wait: 300 },
    )

    const cancelVirtualSelfMediaProject = () => {
        if (editingVirtualId && submittedVirtualIdsRef.current.has(editingVirtualId)) return
        clearVirtualSelfMediaProject()
    }

    const handleVirtualSelfMediaProjectKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            e.preventDefault()
            debouncedConfirmVirtualSelfMediaProject()
        } else if (e.key === "Escape") {
            e.preventDefault()
            cancelVirtualSelfMediaProject()
        }
    }

    const mergeVirtualSelfMediaProjects = (attachmentList: AttachmentItem[]) => {
        if (!virtualSelfMediaProject) return attachmentList

        const { parentPath } = virtualSelfMediaProject

        const virtualAttachment: AttachmentItem & { isVirtual: boolean } = {
            file_id: virtualSelfMediaProject.id,
            name: virtualSelfMediaProject.name,
            path: virtualSelfMediaProject.name,
            type: "folder",
            is_directory: true,
            children: [],
            source: AttachmentSource.PROJECT_DIRECTORY,
            isVirtual: true,
        }

        if (!parentPath) {
            return [virtualAttachment, ...attachmentList]
        }

        const insertIntoFolder = (items: AttachmentItem[]): AttachmentItem[] => {
            return items.map((item) => {
                if (item.is_directory && "children" in item) {
                    const folderPath = item.relative_file_path || `/${item.name}`
                    if (folderPath === parentPath) {
                        return {
                            ...item,
                            children: [virtualAttachment, ...(item.children || [])],
                        }
                    }
                    return {
                        ...item,
                        children: insertIntoFolder(item.children || []),
                    }
                }
                return item
            })
        }

        return insertIntoFolder(attachmentList)
    }

    const resetVirtualSelfMediaProject = () => {
        setVirtualSelfMediaProject(null)
        setEditingVirtualId(null)
        setVirtualSelfMediaProjectName("")
        setErrorMessage("")
    }

    return {
        virtualSelfMediaProjects: virtualSelfMediaProject ? [virtualSelfMediaProject] : [],
        editingVirtualId,
        virtualSelfMediaProjectName,
        setVirtualSelfMediaProjectName,
        errorMessage,
        virtualInputRef,
        createVirtualSelfMediaProject,
        confirmVirtualSelfMediaProject,
        cancelVirtualSelfMediaProject,
        handleVirtualSelfMediaProjectKeyDown,
        mergeVirtualSelfMediaProjects,
        resetVirtualSelfMediaProject,
    }
}
