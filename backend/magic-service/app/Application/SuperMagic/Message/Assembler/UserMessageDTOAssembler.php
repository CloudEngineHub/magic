<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\SuperMagic\Message\Assembler;

use App\Application\SuperMagic\Message\DTO\UserMessageDTO;
use App\Domain\Chat\DTO\Message\TextContentInterface;
use App\Domain\SuperMagic\Common\Entity\ValueObject\SuperMagicExecutionSource;
use App\Domain\SuperMagic\Message\Entity\ValueObject\ChatInstruction;
use App\Domain\SuperMagic\Topic\Entity\TopicEntity;

/**
 * Assembles UserMessageDTO from parsed chat message content.
 * Shared by the HTTP open-api flow (and reusable by the WebSocket flow) so that
 * both pipelines converge on the same UserMessageDTO contract before calling the
 * core HandleUserMessageAppService::handleChatMessage method.
 */
class UserMessageDTOAssembler
{
    /**
     * Build a UserMessageDTO from an already validated/parsed message content struct.
     *
     * @param TextContentInterface $contentStruct Parsed message content (MagicMessageStruct)
     * @param TopicEntity $topicEntity Target topic entity
     * @param string $agentUserId Receiver agent user id
     * @param string $messageType Chat message type (e.g. rich_text)
     * @param string $messageId Business message id (used for dedup / persistence linkage)
     * @param string $messageSeqId IM seq id of the persisted user message
     * @param string $language Current request language
     * @param SuperMagicExecutionSource $executionSource Execution source used to stamp dynamic params
     * @param string $chatConversationId Agent conversation id (may be resolved later by the consumer)
     */
    public static function fromMessageContentStruct(
        TextContentInterface $contentStruct,
        TopicEntity $topicEntity,
        string $agentUserId,
        string $messageType,
        string $messageId,
        string $messageSeqId,
        string $language,
        SuperMagicExecutionSource $executionSource,
        string $chatConversationId = '',
        ?array $messageSubscriptionConfig = null
    ): UserMessageDTO {
        // @phpstan-ignore-next-line method.notFound - MagicMessageStruct implements TextContentInterface and has getExtra()
        $superAgentExtra = $contentStruct->getExtra()?->getSuperAgent();

        $attachments = $contentStruct->getAttachments() ?? [];
        $attachmentsJson = ! empty($attachments) ? json_encode($attachments, JSON_UNESCAPED_UNICODE) : '';

        $mentions = $superAgentExtra?->getMentionsJsonStruct();
        $mentionsJson = ! empty($mentions) ? json_encode($mentions, JSON_UNESCAPED_UNICODE) : null;

        $topicMode = $superAgentExtra?->getTopicPattern() ?? 'general';

        $dynamicParams = SuperMagicExecutionSource::ensureDynamicParams(
            $superAgentExtra?->getDynamicParams(),
            $executionSource
        );

        return new UserMessageDTO(
            agentUserId: $agentUserId,
            chatConversationId: $chatConversationId,
            chatTopicId: $topicEntity->getChatTopicId(),
            topicId: $topicEntity->getId(),
            prompt: $contentStruct->getTextContent(),
            attachments: $attachmentsJson,
            mentions: $mentionsJson,
            instruction: ChatInstruction::Normal,
            topicMode: $topicMode,
            taskMode: '',
            rawContent: null,
            mcpConfig: [],
            modelId: $superAgentExtra?->getModelId() ?? '',
            language: $language,
            queueId: '',
            messageId: $messageId,
            messageSeqId: $messageSeqId,
            chatMessageType: $messageType,
            dynamicParams: $dynamicParams,
            extra: $superAgentExtra,
            messageSubscriptionConfig: $messageSubscriptionConfig,
        );
    }
}
