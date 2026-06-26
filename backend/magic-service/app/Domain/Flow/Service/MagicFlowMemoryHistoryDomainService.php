<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\Flow\Service;

use App\Domain\Flow\Entity\MagicFlowMemoryHistoryEntity;
use App\Domain\Flow\Entity\ValueObject\FlowDataIsolation;
use App\Domain\Flow\Entity\ValueObject\MemoryType;
use App\Domain\Flow\Entity\ValueObject\Query\MagicFlowMemoryHistoryQuery;
use App\Domain\Flow\Repository\Facade\MagicFlowMemoryHistoryRepositoryInterface;
use App\Infrastructure\Core\ValueObject\Page;

class MagicFlowMemoryHistoryDomainService extends AbstractDomainService
{
    public function __construct(
        private readonly MagicFlowMemoryHistoryRepositoryInterface $magicFlowMemoryHistoryRepository,
    ) {
    }

    public function create(FlowDataIsolation $dataIsolation, MagicFlowMemoryHistoryEntity $magicFlowMemoryHistoryEntity): MagicFlowMemoryHistoryEntity
    {
        $magicFlowMemoryHistoryEntity->prepareForCreation();

        return $this->magicFlowMemoryHistoryRepository->create($dataIsolation, $magicFlowMemoryHistoryEntity);
    }

    /**
     * 查询指定会话的流程记忆创建人.
     */
    public function getCreatedUidByConversationId(FlowDataIsolation $dataIsolation, string $conversationId, MemoryType $type): ?string
    {
        return $this->magicFlowMemoryHistoryRepository->getCreatedUidByConversationId($dataIsolation, $conversationId, $type->value);
    }

    /**
     * @return array{total: int, list: array<MagicFlowMemoryHistoryEntity>}
     */
    public function queries(FlowDataIsolation $dataIsolation, MagicFlowMemoryHistoryQuery $query, Page $page): array
    {
        return $this->magicFlowMemoryHistoryRepository->queries($dataIsolation, $query, $page);
    }

    public function removeByConversationId(FlowDataIsolation $dataIsolation, string $conversationId): void
    {
        $this->magicFlowMemoryHistoryRepository->removeByConversationId($dataIsolation, $conversationId);
    }
}
