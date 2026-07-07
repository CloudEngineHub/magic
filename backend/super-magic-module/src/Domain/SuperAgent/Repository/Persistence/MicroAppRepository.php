<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Domain\SuperAgent\Repository\Persistence;

use App\Infrastructure\Util\IdGenerator\IdGenerator;
use Dtyq\SuperMagic\Domain\SuperAgent\Entity\MicroAppEntity;
use Dtyq\SuperMagic\Domain\SuperAgent\Entity\ValueObject\MicroAppPublishStatus;
use Dtyq\SuperMagic\Domain\SuperAgent\Repository\Facade\MicroAppRepositoryInterface;
use Dtyq\SuperMagic\Domain\SuperAgent\Repository\Model\MicroAppModel;

class MicroAppRepository implements MicroAppRepositoryInterface
{
    public function findByProjectId(int $projectId): ?MicroAppEntity
    {
        $model = MicroAppModel::query()
            ->where('project_id', $projectId)
            ->whereNull('deleted_at')
            ->first();

        return $model instanceof MicroAppModel ? $this->toEntity($model) : null;
    }

    public function save(MicroAppEntity $entity): MicroAppEntity
    {
        $now = date('Y-m-d H:i:s');
        $data = $entity->toArray();
        unset($data['deleted_at']);
        $data['updated_at'] = $now;

        if ($entity->getId() > 0) {
            $data['target_ids'] = json_encode($entity->getTargetIds(), JSON_UNESCAPED_UNICODE);
            MicroAppModel::query()
                ->where('id', $entity->getId())
                ->update($data);
            return $entity->setUpdatedAt($now);
        }

        $data['id'] = IdGenerator::getSnowId();
        $data['created_at'] = $now;
        $model = new MicroAppModel();
        $model->fill($data);
        $model->save();

        return $this->toEntity($model);
    }

    public function findPublishedByOrganization(string $organizationCode): array
    {
        $models = MicroAppModel::query()
            ->where('organization_code', $organizationCode)
            ->where('publish_status', MicroAppPublishStatus::Published->value)
            ->whereNull('deleted_at')
            ->orderBy('published_at', 'desc')
            ->get();

        $entities = [];
        foreach ($models as $model) {
            if ($model instanceof MicroAppModel) {
                $entities[] = $this->toEntity($model);
            }
        }

        return $entities;
    }

    private function toEntity(MicroAppModel $model): MicroAppEntity
    {
        $data = $model->toArray();
        $data['target_ids'] = is_array($data['target_ids'] ?? null) ? $data['target_ids'] : [];

        return new MicroAppEntity($data);
    }
}
