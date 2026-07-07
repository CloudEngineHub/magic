<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Interfaces\SuperAgent\DTO\Response;

use App\Infrastructure\Core\AbstractDTO;
use Dtyq\SuperMagic\Domain\SuperAgent\Entity\MessageScheduleEntity;

class OpenMessageScheduleListItemDTO extends AbstractDTO
{
    public string $id = '';

    public string $taskName = '';

    public string $taskDescribe = '';

    public string $topicPattern = 'general';

    public string $agentCode = '';

    public int $enabled = 1;

    public array $timeConfig = [];

    public ?string $deadline = null;

    public static function fromEntity(MessageScheduleEntity $entity): self
    {
        $dto = new self();
        $dto->id = (string) $entity->getId();
        $dto->taskName = $entity->getTaskName();
        $messageContent = $entity->getMessageContent();
        $dto->taskDescribe = OpenMessageScheduleContentExtractor::extractText($messageContent);
        $dto->topicPattern = OpenMessageScheduleContentExtractor::extractTopicPattern($messageContent);
        $dto->agentCode = OpenMessageScheduleContentExtractor::extractAgentCode($messageContent);
        $dto->enabled = $entity->getEnabled();
        $dto->timeConfig = $entity->getTimeConfig();
        $dto->deadline = $entity->getDeadline();
        return $dto;
    }

    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'task_name' => $this->taskName,
            'task_describe' => $this->taskDescribe,
            'topic_pattern' => $this->topicPattern,
            'agent_code' => $this->agentCode,
            'enabled' => $this->enabled,
            'time_config' => array_intersect_key($this->timeConfig, array_flip(['day', 'time', 'type'])),
            'deadline' => $this->deadline,
        ];
    }
}
