import { useState, useRef, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { useDebounceFn, useUpdateEffect } from "ahooks"
import type { InputRef } from "antd"
import type { AttachmentItem } from "./types"
import { AttachmentSource } from "./types"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import { validateFilename } from "@/utils/filename-validator"
import { checkDuplicateFileName } from "../utils/checkDuplicateFileName"

interface VirtualAICardProjectItem {
    id: string
    name: string
    parentPath?: string
    isVirtual: true
    is_directory: true
}

interface UseVirtualAICardProjectOptions {
    attachments: AttachmentItem[]
    setExpandedKeys: (expandedKeys: React.Key[]) => void
    expandedKeys: React.Key[]
    onAICardProjectCreate?: (
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
 * useVirtualAICardProject - 处理虚拟 AI 卡片项目创建功能
 */
export function useVirtualAICardProject(options: UseVirtualAICardProjectOptions) {
    const { t } = useTranslation("super")
    const { attachments, setExpandedKeys, expandedKeys } = options
    const [virtualAICardProject, setVirtualAICardProject] =
        useState<VirtualAICardProjectItem | null>(null)
    const [editingVirtualId, setEditingVirtualId] = useState<string | null>(null)
    const [virtualAICardProjectName, setVirtualAICardProjectName] = useState("")
    const [errorMessage, setErrorMessage] = useState("")
    const virtualInputRef = useRef<InputRef>(null)
    const hasFocusedRef = useRef(false)
    const submittedVirtualIdsRef = useRef<Set<string>>(new Set())

    const focusAndSelectFolderName = (inputRef: InputRef) => {
        inputRef.focus()
        inputRef.setSelectionRange(0, virtualAICardProjectName.length)
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
    }, [editingVirtualId, virtualAICardProjectName.length])

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

    const createVirtualAICardProject = (key?: string, parentPath?: string) => {
        if (editingVirtualId || virtualAICardProject) {
            return
        }

        if (key && setExpandedKeys) {
            setExpandedKeys([...expandedKeys, key])
        }

        const defaultName = t("topicFiles.contextMenu.newAICard.defaultName")

        const newVirtualProject: VirtualAICardProjectItem = {
            id: `virtual_ai_card_project_${Date.now()}`,
            name: defaultName,
            isVirtual: true,
            is_directory: true,
            parentPath,
        }

        setVirtualAICardProject(newVirtualProject)
        setEditingVirtualId(newVirtualProject.id)
        setVirtualAICardProjectName(defaultName)
        setErrorMessage("")
    }

    const clearVirtualAICardProject = () => {
        setVirtualAICardProject(null)
        setEditingVirtualId(null)
        setVirtualAICardProjectName("")
        setErrorMessage("")
    }

    const confirmVirtualAICardProject = async () => {
        if (!editingVirtualId || !virtualAICardProject) return
        if (submittedVirtualIdsRef.current.has(editingVirtualId)) return

        const trimmedName = virtualAICardProjectName.trim()

        if (!trimmedName) {
            cancelVirtualAICardProject()
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

        if (checkDuplicateFileName(trimmedName, attachments, virtualAICardProject.parentPath)) {
            setErrorMessage("")
            setTimeout(() => {
                setErrorMessage(t("topicFiles.contextMenu.newFolder.duplicateError"))
            }, 0)
            return
        }

        submittedVirtualIdsRef.current.add(editingVirtualId)

        try {
            const result = await options.onAICardProjectCreate?.(
                trimmedName,
                virtualAICardProject.parentPath,
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
                    virtualAICardProject.parentPath,
                )

                options.onAttachmentsChange(updatedAttachments)
            } else {
                pubsub.publish(PubSubEvents.Update_Attachments)
            }

            clearVirtualAICardProject()
        } catch (error) {
            submittedVirtualIdsRef.current.delete(editingVirtualId)
            setErrorMessage("创建 AI 卡片项目失败，请重试")
        }
    }

    const { run: debouncedConfirmVirtualAICardProject } = useDebounceFn(
        confirmVirtualAICardProject,
        { wait: 300 },
    )

    const cancelVirtualAICardProject = () => {
        if (editingVirtualId && submittedVirtualIdsRef.current.has(editingVirtualId)) return
        clearVirtualAICardProject()
    }

    const handleVirtualAICardProjectKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            e.preventDefault()
            debouncedConfirmVirtualAICardProject()
        } else if (e.key === "Escape") {
            e.preventDefault()
            cancelVirtualAICardProject()
        }
    }

    const mergeVirtualAICardProjects = (attachmentList: AttachmentItem[]) => {
        if (!virtualAICardProject) return attachmentList

        const { parentPath } = virtualAICardProject

        const virtualAttachment: AttachmentItem & { isVirtual: boolean } = {
            file_id: virtualAICardProject.id,
            name: virtualAICardProject.name,
            path: virtualAICardProject.name,
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

    const resetVirtualAICardProject = () => {
        setVirtualAICardProject(null)
        setEditingVirtualId(null)
        setVirtualAICardProjectName("")
        setErrorMessage("")
    }

    return {
        virtualAICardProjects: virtualAICardProject ? [virtualAICardProject] : [],
        editingVirtualId,
        virtualAICardProjectName,
        setVirtualAICardProjectName,
        errorMessage,
        virtualInputRef,
        createVirtualAICardProject,
        confirmVirtualAICardProject,
        cancelVirtualAICardProject,
        handleVirtualAICardProjectKeyDown,
        mergeVirtualAICardProjects,
        resetVirtualAICardProject,
    }
}
