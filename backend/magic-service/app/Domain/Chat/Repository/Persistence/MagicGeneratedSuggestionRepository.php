<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\Chat\Repository\Persistence;

use App\Domain\Chat\Entity\MagicGeneratedSuggestionEntity;
use App\Domain\Chat\Entity\ValueObject\GeneratedSuggestionStatus;
use App\Domain\Chat\Repository\Facade\MagicGeneratedSuggestionRepositoryInterface;
use App\Domain\Chat\Repository\Persistence\Model\MagicGeneratedSuggestionModel;
use App\Infrastructure\Util\IdGenerator\IdGenerator;
use Hyperf\Database\Exception\QueryException;

class MagicGeneratedSuggestionRepository implements MagicGeneratedSuggestionRepositoryInterface
{
    public function __construct(
        private readonly MagicGeneratedSuggestionModel $model,
    ) {
    }

    /**
     * @param string[] $suggestions
     */
    public function saveReport(
        int $type,
        string $relationId,
        GeneratedSuggestionStatus $status,
        array $suggestions,
        ?string $createdUid,
    ): MagicGeneratedSuggestionEntity {
        $relationId = $this->normalizeKey($relationId);
        $existing = $this->findLatestEntityByTypeAndRelationId($type, $relationId);
        if ($existing === null) {
            try {
                return $this->insertReport($type, $relationId, $status, $suggestions, $createdUid);
            } catch (QueryException $exception) {
                if ((int) ($exception->errorInfo[1] ?? 0) !== 1062) {
                    throw $exception;
                }
                $existing = $this->findLatestEntityByTypeAndRelationId($type, $relationId);
                if ($existing === null) {
                    throw $exception;
                }
            }
        }

        return $this->updateGeneratingReport($type, $relationId, $existing, $status, $suggestions);
    }

    public function findLatestEntityByTypeAndRelationId(int $type, int|string $relationId): ?MagicGeneratedSuggestionEntity
    {
        $record = $this->model::query()
            ->where('type', $type)
            ->where('relation_id', $this->normalizeKey($relationId))
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->first();

        return $record === null ? null : new MagicGeneratedSuggestionEntity($record->toArray());
    }

    /**
     * 首次写入。suggestions 只在完成态保存，查询构建器更新不会走模型 cast。
     *
     * @param string[] $suggestions
     */
    private function insertReport(
        int $type,
        string $relationId,
        GeneratedSuggestionStatus $status,
        array $suggestions,
        ?string $createdUid,
    ): MagicGeneratedSuggestionEntity {
        $now = date('Y-m-d H:i:s');
        $record = $this->model::query()->create([
            'id' => IdGenerator::getSnowId(),
            'type' => $type,
            'relation_id' => $relationId,
            'params' => null,
            'suggestions' => $status === GeneratedSuggestionStatus::Done ? array_values($suggestions) : null,
            'status' => $status->value,
            'created_uid' => $this->normalizeNullableKey($createdUid),
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        return new MagicGeneratedSuggestionEntity($record->toArray());
    }

    /**
     * 生成中可以进入终态；终态和重复的生成中保持已存结果。
     *
     * @param string[] $suggestions
     */
    private function updateGeneratingReport(
        int $type,
        string $relationId,
        MagicGeneratedSuggestionEntity $existing,
        GeneratedSuggestionStatus $status,
        array $suggestions,
    ): MagicGeneratedSuggestionEntity {
        $current = $existing->getStatus();
        if ($current !== GeneratedSuggestionStatus::Generating || $status === GeneratedSuggestionStatus::Generating) {
            return $existing;
        }

        $updated = $this->model::query()
            ->where('type', $type)
            ->where('relation_id', $relationId)
            ->where('status', GeneratedSuggestionStatus::Generating->value)
            ->update([
                'status' => $status->value,
                'suggestions' => $status === GeneratedSuggestionStatus::Done
                    ? json_encode(array_values($suggestions), JSON_UNESCAPED_UNICODE)
                    : null,
                'updated_at' => date('Y-m-d H:i:s'),
            ]);
        if ($updated === 0) {
            return $this->findLatestEntityByTypeAndRelationId($type, $relationId) ?? $existing;
        }

        return $this->findLatestEntityByTypeAndRelationId($type, $relationId) ?? $existing;
    }

    private function normalizeKey(null|int|string $value): string
    {
        if ($value === null) {
            return '';
        }

        return (string) $value;
    }

    private function normalizeNullableKey(null|int|string $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        return (string) $value;
    }
}
