import { useCallback } from "react"
import { aiLLMService } from "@/services/ai/AiLLMService"
import type { LLMMessage } from "@/services/ai/AiLLMService"
import type { MentionNodeInfo } from "./types"

interface UseAIPolishOptions {
    /** Model ID to use for polishing (optional — uses service default if not provided) */
    model?: string
}

/**
 * Hook that provides an AI polish function compatible with MagicPromptEditor.
 *
 * The polish function:
 * 1. Receives text with mention placeholders (e.g. {{MENTION_0}})
 * 2. Sends to AI via AiLLMService chat with instructions to preserve those placeholders
 * 3. Returns polished text with placeholders intact
 *
 * Usage:
 * ```tsx
 * const { polishText } = useAIPolish({ model: selectedModelId })
 * <MagicPromptEditor enableAIPolish onAIPolish={polishText} />
 * ```
 */
export function useAIPolish(options: UseAIPolishOptions = {}) {
    const { model } = options

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
                const messages: LLMMessage[] = [{ role: "user", content: polishPrompt }]
                const result = await aiLLMService.chat(messages, {
                    model,
                    temperature: 0.5,
                    systemPrompt: "你是一个文案润色助手。直接输出润色后的文字，不要有任何前缀说明。",
                })

                const polished = result.content.trim()
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
        [model],
    )

    return { polishText }
}
