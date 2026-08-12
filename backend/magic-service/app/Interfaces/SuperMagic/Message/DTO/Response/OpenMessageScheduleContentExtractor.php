<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SuperMagic\Message\DTO\Response;

/**
 * Open API 定时任务消息内容解析器。
 */
class OpenMessageScheduleContentExtractor
{
    /**
     * 从 message_content.content 中提取纯文本内容。
     */
    public static function extractText(array $messageContent): string
    {
        $contentJson = $messageContent['content'] ?? '';
        if (empty($contentJson)) {
            return '';
        }

        $doc = is_string($contentJson) ? json_decode($contentJson, true) : $contentJson;
        if (! is_array($doc)) {
            return is_string($contentJson) ? $contentJson : '';
        }

        $texts = [];
        self::collectTexts($doc, $texts);
        return implode('', $texts);
    }

    /**
     * 从 message_content.extra.super_agent 中提取模型 ID。
     */
    public static function extractModelId(array $messageContent): string
    {
        return (string) ($messageContent['extra']['super_agent']['model']['model_id']
            ?? $messageContent['extra']['super_agent']['model']['provider_model_id']
            ?? '');
    }

    /**
     * 从 message_content.extra.super_agent 中提取 topic_pattern。
     */
    public static function extractTopicPattern(array $messageContent): string
    {
        return (string) (self::extractSuperAgentExtra($messageContent)['topic_pattern'] ?? 'general');
    }

    /**
     * 从 message_content.extra.super_agent 中提取 agent_code。
     */
    public static function extractAgentCode(array $messageContent): string
    {
        return (string) (self::extractSuperAgentExtra($messageContent)['agent_code'] ?? '');
    }

    /**
     * 从 message_content 中提取 Super Agent 扩展配置。
     */
    private static function extractSuperAgentExtra(array $messageContent): array
    {
        $extra = $messageContent['extra']['super_agent'] ?? [];
        return is_array($extra) ? $extra : [];
    }

    /**
     * 递归收集 Tiptap JSONContent 中的文本节点。
     */
    private static function collectTexts(array $node, array &$texts): void
    {
        if (isset($node['type']) && $node['type'] === 'text' && isset($node['text'])) {
            $texts[] = $node['text'];
        }
        if (isset($node['content']) && is_array($node['content'])) {
            foreach ($node['content'] as $child) {
                if (is_array($child)) {
                    self::collectTexts($child, $texts);
                }
            }
        }
    }
}
