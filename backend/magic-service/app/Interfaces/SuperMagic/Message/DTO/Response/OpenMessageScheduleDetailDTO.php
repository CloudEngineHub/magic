<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SuperMagic\Message\DTO\Response;

use App\Domain\SuperMagic\Message\Entity\MessageScheduleEntity;
use App\Infrastructure\Core\AbstractDTO;

class OpenMessageScheduleDetailDTO extends AbstractDTO
{
    public string $id = '';

    public string $taskName = '';

    public string $messageContent = '';

    public string $topicId = '';

    public string $modelId = '';

    public string $topicPattern = 'general';

    public string $agentCode = '';

    public array $timeConfig = [];

    public int $enabled = 1;

    public int $completed = 0;

    public ?string $updatedAt = null;

    public ?string $deadline = null;

    public static function fromEntity(MessageScheduleEntity $entity): self
    {
        $dto = new self();
        $dto->id = (string) $entity->getId();
        $dto->taskName = $entity->getTaskName();
        $dto->topicId = (string) $entity->getTopicId();
        $dto->timeConfig = $entity->getTimeConfig();
        $dto->enabled = $entity->getEnabled();
        $dto->completed = $entity->getCompleted();
        $dto->updatedAt = $entity->getUpdatedAt();
        $dto->deadline = $entity->getDeadline();

        $messageContent = $entity->getMessageContent();
        $dto->messageContent = OpenMessageScheduleContentExtractor::extractText($messageContent);
        $dto->modelId = OpenMessageScheduleContentExtractor::extractModelId($messageContent);
        $dto->topicPattern = OpenMessageScheduleContentExtractor::extractTopicPattern($messageContent);
        $dto->agentCode = OpenMessageScheduleContentExtractor::extractAgentCode($messageContent);

        return $dto;
    }

    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'task_name' => $this->taskName,
            'message_content' => $this->messageContent,
            'topic_id' => $this->topicId,
            'model_id' => $this->modelId,
            'topic_pattern' => $this->topicPattern,
            'agent_code' => $this->agentCode,
            'time_config' => array_intersect_key($this->timeConfig, array_flip(['day', 'time', 'type'])),
            'deadline' => $this->deadline,
            'enabled' => $this->enabled,
            'completed' => $this->completed,
            'updated_at' => $this->updatedAt,
        ];
    }
}
