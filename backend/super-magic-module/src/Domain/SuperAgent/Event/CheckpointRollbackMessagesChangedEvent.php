<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Domain\SuperAgent\Event;

class CheckpointRollbackMessagesChangedEvent extends AbstractEvent
{
    public const string ACTION_START = 'start';

    public const string ACTION_UNDO = 'undo';

    public const string ACTION_COMMIT = 'commit';

    public const string ACTION_ROLLBACK = 'rollback';

    /**
     * @param array<int|string> $affectedSeqIds
     */
    public function __construct(
        private readonly string $action,
        private readonly int $topicId,
        private readonly string $chatTopicId,
        private readonly int $projectId,
        private readonly string $userId,
        private readonly string $organizationCode,
        private readonly string $conversationId,
        private readonly array $affectedSeqIds,
        private readonly ?string $targetSeqId = null,
    ) {
        parent::__construct();
    }

    public function getAction(): string
    {
        return $this->action;
    }

    public function getTopicId(): int
    {
        return $this->topicId;
    }

    public function getChatTopicId(): string
    {
        return $this->chatTopicId;
    }

    public function getProjectId(): int
    {
        return $this->projectId;
    }

    public function getUserId(): string
    {
        return $this->userId;
    }

    public function getOrganizationCode(): string
    {
        return $this->organizationCode;
    }

    public function getConversationId(): string
    {
        return $this->conversationId;
    }

    /**
     * @return array<int|string>
     */
    public function getAffectedSeqIds(): array
    {
        return $this->affectedSeqIds;
    }

    public function getTargetSeqId(): ?string
    {
        return $this->targetSeqId;
    }
}
