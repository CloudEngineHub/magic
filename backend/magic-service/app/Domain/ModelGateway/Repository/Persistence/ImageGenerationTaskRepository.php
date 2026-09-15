<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\ModelGateway\Repository\Persistence;

use App\Domain\ModelGateway\Entity\ImageGenerationTaskEntity;
use App\Domain\ModelGateway\Entity\ValueObject\ImageGenerationTaskStatus;
use App\Domain\ModelGateway\Repository\ImageGenerationTaskRepositoryInterface;
use App\Domain\ModelGateway\Repository\Persistence\Model\ImageGenerationTaskModel;
use Carbon\Carbon;

class ImageGenerationTaskRepository implements ImageGenerationTaskRepositoryInterface
{
    public function getById(string $id): ?ImageGenerationTaskEntity
    {
        $model = ImageGenerationTaskModel::query()->where('id', $id)->first();
        if (! $model instanceof ImageGenerationTaskModel) {
            return null;
        }

        return $this->createEntity($model);
    }

    public function save(ImageGenerationTaskEntity $entity): void
    {
        ImageGenerationTaskModel::query()->updateOrCreate(
            ['id' => $entity->getId()],
            $entity->toPersistenceArray()
        );
    }

    private function createEntity(ImageGenerationTaskModel $model): ImageGenerationTaskEntity
    {
        return new ImageGenerationTaskEntity(
            id: $model->id,
            organizationCode: $model->organization_code,
            userId: $model->user_id,
            accessTokenId: $model->access_token_id,
            environment: $model->environment,
            model: $model->model,
            requestPayload: is_array($model->request_payload) ? $model->request_payload : [],
            status: ImageGenerationTaskStatus::tryFrom($model->status) ?? ImageGenerationTaskStatus::FAILED,
            responsePayload: is_array($model->response_payload) ? $model->response_payload : [],
            errorCode: $model->error_code,
            errorMessage: $model->error_message,
            createdAt: $this->formatDateTime($model->created_at),
            startedAt: $this->formatDateTime($model->started_at),
            finishedAt: $this->formatNullableDateTime($model->finished_at),
            updatedAt: $this->formatDateTime($model->updated_at),
        );
    }

    private function formatDateTime(null|Carbon|string $value): string
    {
        if ($value instanceof Carbon) {
            return $value->toDateTimeString();
        }
        return is_string($value) ? $value : '';
    }

    private function formatNullableDateTime(null|Carbon|string $value): ?string
    {
        if ($value === null) {
            return null;
        }
        return $this->formatDateTime($value);
    }
}
