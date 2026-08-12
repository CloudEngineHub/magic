<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\SuperMagic\Message\DTO;

/**
 * Task initialization message DTO.
 *
 * Carries a fully serialized UserMessageDTO (as array) plus the synchronously created
 * task id, so the queue consumer can reconstruct the DTO and delegate to the unified
 * HandleUserMessageAppService::handleChatMessage without any extra lookups.
 */
class TaskInitializationMessageDTO
{
    /**
     * @param array $userMessage Serialized UserMessageDTO (UserMessageDTO::toArray())
     */
    public function __construct(
        private readonly string $organizationCode,
        private readonly string $userId,
        private readonly int $projectId,
        private readonly int $topicId,
        private readonly int $taskId,
        private readonly array $userMessage,
        private readonly string $language,
        private readonly string $chatTopicId = '',
        private readonly string $agentUserId = '',
    ) {
    }

    public function getOrganizationCode(): string
    {
        return $this->organizationCode;
    }

    public function getUserId(): string
    {
        return $this->userId;
    }

    public function getProjectId(): int
    {
        return $this->projectId;
    }

    public function getTopicId(): int
    {
        return $this->topicId;
    }

    public function getTaskId(): int
    {
        return $this->taskId;
    }

    public function getUserMessage(): array
    {
        return $this->userMessage;
    }

    public function getLanguage(): string
    {
        return $this->language;
    }

    public function getChatTopicId(): string
    {
        return $this->chatTopicId;
    }

    public function getAgentUserId(): string
    {
        return $this->agentUserId;
    }

    public function toArray(): array
    {
        return [
            'organization_code' => $this->organizationCode,
            'user_id' => $this->userId,
            'project_id' => $this->projectId,
            'topic_id' => $this->topicId,
            'task_id' => $this->taskId,
            'user_message' => $this->userMessage,
            'language' => $this->language,
            'chat_topic_id' => $this->chatTopicId,
            'agent_user_id' => $this->agentUserId,
        ];
    }

    public static function fromArray(array $data): self
    {
        return new self(
            organizationCode: $data['organization_code'] ?? '',
            userId: $data['user_id'] ?? '',
            projectId: (int) ($data['project_id'] ?? 0),
            topicId: (int) ($data['topic_id'] ?? 0),
            taskId: (int) ($data['task_id'] ?? 0),
            userMessage: $data['user_message'] ?? [],
            language: $data['language'] ?? 'en_US',
            chatTopicId: $data['chat_topic_id'] ?? '',
            agentUserId: $data['agent_user_id'] ?? '',
        );
    }
}
