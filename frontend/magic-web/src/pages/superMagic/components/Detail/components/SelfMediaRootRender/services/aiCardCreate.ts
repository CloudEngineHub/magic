import { SuperMagicApi } from "@/apis"
import { projectStore, topicStore } from "@/pages/superMagic/stores/core"
import routeManageService from "@/pages/superMagic/services/routeManageService"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import { buildPlainTextJSONContent } from "../../../../MessageEditor/utils"
import { superMagicTopicModelService } from "@/services/superMagic/topicModel"
import type { JSONContent } from "@tiptap/react"
import type { ScheduledTask } from "@/types/scheduledTask"
import type { ModelItem } from "@/pages/superMagic/components/MessageEditor/components/ModelSwitch/types"

export interface AICardCreateParams {
    /** User's analysis prompt (plain text, used for template text) */
    prompt: string
    /** User's prompt as JSONContent (preserves @mention nodes) */
    promptJSONContent?: JSONContent
    /** Card name (e.g. "抖音热点追踪") */
    cardName: string
    /** Template choice */
    template: "hotspot-tracker" | "daily-digest" | "analytics-panel" | "custom"
    /** Custom template requirements (when template is "custom") */
    customTemplatePrompt?: string
    /** Project ID */
    projectId: string
    /** Folder path of the self-media project (optional) */
    folderPath?: string
    /** Schedule time config (optional — if provided, included in prompt) */
    timeConfig?: ScheduledTask.TimeConfig | null
    /** Whether the scheduled task should be enabled */
    enabled?: boolean
    /** Selected language model */
    model?: ModelItem | null
    /** Selected image model */
    imageModel?: ModelItem | null
    /** Selected video model */
    videoModel?: ModelItem | null
}

const SEND_MESSAGE_DELAY_MS = 300

/**
 * Format a TimeConfig into a human-readable schedule description.
 */
function formatScheduleDescription(timeConfig: ScheduledTask.TimeConfig): string {
    const { type, time, day } = timeConfig
    switch (type) {
        case "no_repeat":
            return `单次执行，时间: ${time}`
        case "daily_repeat":
            return `每天 ${time} 执行`
        case "weekly_repeat":
            return `每周${day ? `周${day}` : ""} ${time} 执行`
        case "monthly_repeat":
            return `每月${day ? `${day}日` : ""} ${time} 执行`
        default:
            return `${time} 执行`
    }
}

/**
 * Build the prompt message that triggers the ai-card-generator skill.
 * Returns the prefix lines (everything before the user's prompt).
 */
function buildAICardCreatePrefixLines(params: AICardCreateParams): string[] {
    const { prompt, cardName, template, customTemplatePrompt, folderPath, timeConfig, enabled } = params

    const templateInstruction =
        template === "custom"
            ? customTemplatePrompt
                ? `根据以下自定义需求设计模板布局: ${customTemplatePrompt}`
                : `根据分析指令的内容自行设计模板布局。`
            : `参考预设模板 ${template} 的结构和样式来设计卡片。`

    // Determine where the card directory should be created
    const cardDir = folderPath ? `${folderPath}/analysis/${cardName}` : `analysis/${cardName}`
    const locationInstruction = folderPath
        ? `在项目目录 ${folderPath}/ 下创建卡片目录「${cardName}」`
        : `在项目根目录下创建卡片目录「${cardName}」`

    // Build schedule section
    let scheduleInstruction: string
    if (timeConfig) {
        const scheduleDesc = formatScheduleDescription(timeConfig)
        const enabledText = enabled !== false ? "（已启用）" : "（暂不启用）"
        scheduleInstruction = `定时规则: ${scheduleDesc} ${enabledText}\n请按此规则设置定时任务，定期自动获取最新数据并更新卡片。`
    } else {
        scheduleInstruction = `创建完成后请设置每日定时任务，每天自动获取最新数据并更新卡片。`
    }

    return [
        `请创建一个 AI 卡片「${cardName}」。`,
        ``,
        `━━━ 创建位置 ━━━`,
        `${locationInstruction}`,
        `完整路径: ${cardDir}/`,
        ``,
        `━━━ 卡片模板 ━━━`,
        templateInstruction,
        ``,
        `━━━ 定时更新 ━━━`,
        scheduleInstruction,
        ``,
        `━━━ 分析指令 ━━━`,
    ]
}

function buildAICardCreatePrompt(params: AICardCreateParams): string {
    const lines = buildAICardCreatePrefixLines(params)
    lines.push(params.prompt)
    return lines.join("\n")
}

/**
 * Build the final JSONContent for the message, preserving @mention nodes
 * from the user's prompt while prepending instruction text.
 */
function buildAICardCreateJSONContent(params: AICardCreateParams): JSONContent {
    const prefixLines = buildAICardCreatePrefixLines(params)
    const prefixContent = buildPlainTextJSONContent(prefixLines.join("\n"))

    if (params.promptJSONContent?.content) {
        // Merge prefix paragraphs + user's original prompt paragraphs (with mentions)
        return {
            type: "doc",
            content: [...(prefixContent.content || []), ...params.promptJSONContent.content],
        }
    }

    // Fallback: append plain text prompt
    const promptParagraph = { type: "paragraph", content: [{ type: "text", text: params.prompt }] }
    return {
        type: "doc",
        content: [...(prefixContent.content || []), promptParagraph],
    }
}

/**
 * Create a new topic in ip-manager and send a message that triggers
 * the ai-card-generator skill to create all card files + scheduled task.
 */
export async function createAICardViaTopic(
    params: AICardCreateParams,
): Promise<{ topicId: string } | null> {
    const { projectId, cardName, model, imageModel, videoModel } = params

    if (!projectId) {
        console.error("[aiCardCreate] No project selected")
        return null
    }

    const selectedProject = projectStore.selectedProject

    // Create a dedicated topic for this AI card creation
    const topicName = `[AI卡片] ${cardName}`
    const newTopic = await SuperMagicApi.createTopic({
        project_id: projectId,
        topic_name: topicName,
    })

    if (!newTopic?.id) {
        console.error("[aiCardCreate] Failed to create topic")
        return null
    }

    // Pre-warm sandbox for faster execution
    SuperMagicApi.preWarmSandbox({ topic_id: newTopic.id })

    // Navigate to the new topic
    topicStore.setSelectedTopic(newTopic)
    routeManageService.navigateToState({
        projectId: selectedProject?.id || projectId,
        topicId: newTopic.id,
    })

    // Persist user-selected models to the new topic
    if (model || imageModel || videoModel) {
        superMagicTopicModelService.saveModel(
            newTopic.id,
            projectId,
            model || undefined,
            imageModel || undefined,
            videoModel || undefined,
        )
    }

    // Build extra with topic_pattern and user-selected models
    const superAgent: Record<string, unknown> = {
        topic_pattern: "ip-manager",
    }
    if (model) {
        superAgent.model = { model_id: model.model_id }
    }
    if (imageModel) {
        superAgent.image_model = { model_id: imageModel.model_id }
    }
    if (videoModel) {
        superAgent.video_model = { model_id: videoModel.model_id }
    }

    // Build and send message after a short delay (allow topic switch to settle)
    const jsonContent = buildAICardCreateJSONContent(params)
    const payload = {
        jsonContent,
        extra: {
            super_agent: superAgent,
        },
    }

    setTimeout(() => {
        pubsub.publish(PubSubEvents.Send_Message_by_Content, payload)
    }, SEND_MESSAGE_DELAY_MS)

    return { topicId: newTopic.id }
}
