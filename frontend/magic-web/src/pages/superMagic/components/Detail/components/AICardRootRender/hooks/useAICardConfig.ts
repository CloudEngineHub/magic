import { useState, useCallback, useEffect } from "react"
import { useMemoizedFn } from "ahooks"
import { ScheduledTaskApi } from "@/apis"
import { ScheduledTask } from "@/types/scheduledTask"
import { workspaceStore, projectStore } from "@/pages/superMagic/stores/core"
import superMagicModeService from "@/services/superMagic/SuperMagicModeService"
import { superMagicTopicModelCacheService } from "@/services/superMagic/topicModel"
import topicModelStore from "@/stores/superMagic/topicModelStore"
import type { ModelItem } from "@/pages/superMagic/components/MessageEditor/components/ModelSwitch/types"
import type { AICardStore } from "../stores/AICardStore"

const AI_CARD_TOPIC_PATTERN = "ip-manager"

/** Card templates available from the ai-card-generator skill */
export const CARD_TEMPLATES = [
    { value: "hotspot-tracker", label: "热点追踪" },
    { value: "daily-digest", label: "每日摘要" },
    { value: "analytics-panel", label: "数据面板" },
    { value: "custom", label: "自定义" },
] as const

export type CardTemplateType = (typeof CARD_TEMPLATES)[number]["value"]

export interface AICardConfigFormValues {
    taskName: string
    prompt: string
    timeConfig: ScheduledTask.TimeConfig | null
    enabled: boolean
    deadline?: string
    model: ModelItem | null
    imageModel: ModelItem | null
    videoModel: ModelItem | null
    template: CardTemplateType
}

const DEFAULT_FORM_VALUES: AICardConfigFormValues = {
    taskName: "",
    prompt: "",
    timeConfig: null,
    enabled: true,
    model: null,
    imageModel: null,
    videoModel: null,
    template: "hotspot-tracker",
}

/**
 * Build the full message content that triggers the ai-card-generator skill.
 * Wraps user's raw prompt with required context so the agent knows the card directory,
 * template choice, and file locations.
 */
function buildScheduleMessageContent(
    userPrompt: string,
    taskName: string,
    template: CardTemplateType,
): string {
    const lines = [
        `请更新 AI 卡片「${taskName}」。`,
        ``,
        `━━━ 卡片模板 ━━━`,
        template === "custom"
            ? `使用卡片目录中的 template.html 作为模板。`
            : `使用预设模板: ${template}，参考 templates/${template}.html 的结构和样式。`,
        ``,
        `━━━ 执行步骤 ━━━`,
        `1. 读取卡片目录下的 template.html 理解布局结构和数据区域标记`,
        `2. 读取 card.meta.json 获取上下文信息`,
        `3. 按照下方"分析指令"获取和分析最新数据`,
        `4. 基于模板结构 + 新数据生成完整 HTML 页面`,
        `5. 将当前 latest.html 移入 history/ 目录（命名为 YYYY-MM-DD_HH-mm.html）`,
        `6. 写入新的 latest.html`,
        `7. 更新 card.meta.json 的 last_generated 和 generation_count`,
        ``,
        `━━━ 分析指令 ━━━`,
        userPrompt,
    ]
    return lines.join("\n")
}

export function useAICardConfig(store: AICardStore) {
    const [formValues, setFormValues] = useState<AICardConfigFormValues>(DEFAULT_FORM_VALUES)
    const [saving, setSaving] = useState(false)
    const [loadingDetail, setLoadingDetail] = useState(false)
    const [modelList, setModelList] = useState<ModelItem[]>([])
    const [imageModelList, setImageModelList] = useState<ModelItem[]>([])
    const [videoModelList, setVideoModelList] = useState<ModelItem[]>([])

    // Load available models from ip-manager agent's model list
    useEffect(() => {
        const langModels = superMagicModeService.getModelListByMode(AI_CARD_TOPIC_PATTERN)
        const imgModels = superMagicModeService.getImageModelListByMode(AI_CARD_TOPIC_PATTERN)
        const vidModels = superMagicModeService.getVideoModelListByMode(AI_CARD_TOPIC_PATTERN)
        setModelList(langModels)
        setImageModelList(imgModels)
        setVideoModelList(vidModels)

        // Load project-level persisted model selections as initial defaults
        const selectedProject = projectStore.selectedProject
        if (selectedProject?.id) {
            superMagicTopicModelCacheService.getProjectModel(selectedProject.id).then((cached) => {
                if (!cached) return
                setFormValues((prev) => {
                    // Only fill in if not already set (e.g. from loadConfig)
                    if (prev.model || prev.imageModel || prev.videoModel) return prev
                    return {
                        ...prev,
                        model: cached.languageModelId
                            ? langModels.find((m) => m.model_id === cached.languageModelId) || null
                            : null,
                        imageModel: cached.imageModelId
                            ? imgModels.find((m) => m.model_id === cached.imageModelId) || null
                            : null,
                        videoModel: cached.videoModelId
                            ? vidModels.find((m) => m.model_id === cached.videoModelId) || null
                            : null,
                    }
                })
            })
        }
    }, [])

    const loadConfig = useCallback(async () => {
        const config = store.projectConfig
        if (!config) return

        const values: AICardConfigFormValues = {
            taskName: config.name || "",
            prompt: config.prompt || "",
            timeConfig: null,
            enabled: config.enabled === 1,
            model: topicModelStore.selectedLanguageModel || null,
            imageModel: topicModelStore.selectedImageModel || null,
            videoModel: topicModelStore.selectedVideoModel || null,
            template: "hotspot-tracker",
        }

        // Load full task detail from API if schedule_id exists
        if (config.schedule_id) {
            setLoadingDetail(true)
            try {
                const detail = await ScheduledTaskApi.getScheduledTaskDetails(config.schedule_id)
                if (detail) {
                    values.timeConfig = detail.time_config
                    values.enabled = detail.enabled === 1
                    values.taskName = detail.task_name || values.taskName
                    values.deadline = detail.deadline
                    // Restore model selections from saved task
                    const superAgent = detail.message_content?.extra?.super_agent
                    if (superAgent?.model) {
                        values.model = superAgent.model as ModelItem
                    }
                    if ((superAgent as any)?.image_model) {
                        values.imageModel = (superAgent as any).image_model as ModelItem
                    }
                    if ((superAgent as any)?.video_model) {
                        values.videoModel = (superAgent as any).video_model as ModelItem
                    }
                }
            } catch {
                // If task was deleted, ignore
            } finally {
                setLoadingDetail(false)
            }
        }

        setFormValues(values)
    }, [store.projectConfig])

    const saveConfig = useMemoizedFn(async (values: AICardConfigFormValues) => {
        if (!values.timeConfig) return
        setSaving(true)

        try {
            const selectedWorkspace = workspaceStore.selectedWorkspace
            const selectedProject = projectStore.selectedProject

            // Build wrapped prompt content for the agent
            const messageContent = buildScheduleMessageContent(
                values.prompt,
                values.taskName,
                values.template,
            )

            const taskData: ScheduledTask.UpdateTask = {
                message_content: {
                    content: messageContent,
                    extra: {
                        super_agent: {
                            topic_pattern: AI_CARD_TOPIC_PATTERN,
                            chat_mode: "normal",
                            model: values.model
                                ? ({ model_id: values.model.model_id } as any)
                                : null,
                            ...(values.imageModel
                                ? {
                                    image_model: {
                                        model_id: values.imageModel.model_id,
                                    } as any,
                                }
                                : {}),
                            ...(values.videoModel
                                ? {
                                    video_model: {
                                        model_id: values.videoModel.model_id,
                                    } as any,
                                }
                                : {}),
                        },
                    },
                },
                message_type: "text",
                enabled: values.enabled ? 1 : 0,
                task_name: values.taskName,
                time_config: values.timeConfig,
                topic_id: "",
                workspace_id: selectedWorkspace?.id || "",
                project_id: selectedProject?.id || "",
                deadline: values.deadline,
            }

            const scheduleId = store.projectConfig?.schedule_id

            if (scheduleId) {
                await ScheduledTaskApi.updateScheduledTask(scheduleId, {
                    ...taskData,
                    id: scheduleId,
                })
            } else {
                await ScheduledTaskApi.createScheduledTask(taskData)
            }

            // Switch back to dashboard after save
            store.setViewMode("dashboard")
        } finally {
            setSaving(false)
        }
    })

    const updateFormValues = useMemoizedFn((updates: Partial<AICardConfigFormValues>) => {
        setFormValues((prev) => ({ ...prev, ...updates }))
    })

    return {
        formValues,
        updateFormValues,
        loadConfig,
        saveConfig,
        saving,
        loadingDetail,
        modelList,
        imageModelList,
        videoModelList,
    }
}
