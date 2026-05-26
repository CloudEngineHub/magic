import { useCallback } from "react"
import { ChatApi } from "@/apis"
import type { MentionNodeInfo } from "./types"

interface UseAIPolishOptions {
    /** Conversation ID for context (optional — if not provided, uses empty string) */
    conversationId?: string
    /** Topic ID for context (optional) */
    topicId?: string
}

/**
 * Hook that provides an AI polish function compatible with MagicPromptEditor.
 *
 * The polish function:
 * 1. Receives text with mention placeholders (e.g. {{MENTION_0}})
 * 2. Sends to AI with instructions to preserve those placeholders
 * 3. Returns polished text with placeholders intact
 *
 * Usage:
 * ```tsx
 * const { polishText } = useAIPolish({ conversationId, topicId })
 * <MagicPromptEditor enableAIPolish onAIPolish={polishText} />
 * ```
 */
export function useAIPolish(options: UseAIPolishOptions = {}) {
    const { conversationId = "", topicId = "" } = options

    const polishText = useCallback(
        async (text: string, mentions: MentionNodeInfo[]): Promise<string> => {
            if (!text.trim()) return text

            // Build the prompt for AI polish
            const hasMentions = mentions.length > 0
            const mentionInstructions = hasMentions
                ? `\n\n重要：文本中包含以下占位符代表@引用节点，请在润色时保留它们的原始格式和位置（可以调整周围文字但不要修改占位符本身）：${mentions.map((m) => m.placeholder).join(", ")}`
                : ""

            const polishPrompt = `请对以下文本进行润色优化，使其更加流畅、专业、清晰。保持原意不变，不要添加新内容。${mentionInstructions}\n\n原文：\n${text}`

            try {
                const res = await ChatApi.getAiAutoCompletion({
                    conversation_id: conversationId,
                    topic_id: topicId,
                    message: polishPrompt,
                })

                const polished = res.choices?.[0]?.message?.content
                if (!polished) return text

                // Validate that all mention placeholders are preserved
                if (hasMentions) {
                    const allPreserved = mentions.every((m) => polished.includes(m.placeholder))
                    if (!allPreserved) {
                        // If AI dropped some placeholders, fall back to original
                        console.warn("[AIPolish] AI response dropped mention placeholders, falling back to original")
                        return text
                    }
                }

                return polished
            } catch (error) {
                console.error("[AIPolish] Failed to polish text:", error)
                return text
            }
        },
        [conversationId, topicId],
    )

    return { polishText }
}
