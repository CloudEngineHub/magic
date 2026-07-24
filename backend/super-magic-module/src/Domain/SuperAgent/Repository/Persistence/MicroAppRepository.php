<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Domain\SuperAgent\Repository\Persistence;

use App\Infrastructure\Util\IdGenerator\IdGenerator;
use Dtyq\SuperMagic\Domain\SuperAgent\Entity\MicroAppEntity;
use Dtyq\SuperMagic\Domain\SuperAgent\Entity\ValueObject\MicroAppListScope;
use Dtyq\SuperMagic\Domain\SuperAgent\Entity\ValueObject\MicroAppPublishStatus;
use Dtyq\SuperMagic\Domain\SuperAgent\Repository\Facade\MicroAppRepositoryInterface;
use Dtyq\SuperMagic\Domain\SuperAgent\Repository\Model\MicroAppModel;
use Hyperf\DbConnection\Db;
use RuntimeException;

class MicroAppRepository implements MicroAppRepositoryInterface
{
    public function findById(int $id): ?MicroAppEntity
    {
        $model = MicroAppModel::query()
            ->where('id', $id)
            ->whereNull('deleted_at')
            ->first();

        return $model instanceof MicroAppModel ? $this->toEntity($model) : null;
    }

    public function findByProjectId(int $projectId): ?MicroAppEntity
    {
        $model = MicroAppModel::query()
            ->where('project_id', $projectId)
            ->whereNull('deleted_at')
            ->first();

        return $model instanceof MicroAppModel ? $this->toEntity($model) : null;
    }

    public function ensureByProjectId(
        int $projectId,
        string $organizationCode,
        string $userId,
        string $creatorId
    ): MicroAppEntity {
        $existing = $this->findByProjectId($projectId);
        if ($existing !== null) {
            return $existing;
        }

        $now = date('Y-m-d H:i:s');
        MicroAppModel::query()->insertOrIgnore([
            'id' => IdGenerator::getSnowId(),
            'project_id' => $projectId,
            'resource_id' => (string) IdGenerator::getSnowId(),
            'share_id' => null,
            'share_code' => null,
            'organization_code' => $organizationCode,
            'user_id' => $userId,
            'creator_id' => $creatorId,
            'cover_file_key' => null,
            'share_type' => 0,
            'share_range' => null,
            'target_ids' => json_encode([], JSON_UNESCAPED_UNICODE),
            'publish_status' => MicroAppPublishStatus::Unpublished->value,
            'access_url' => '',
            'published_at' => null,
            'unpublished_at' => null,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        $record = $this->findByProjectId($projectId);
        if ($record === null) {
            throw new RuntimeException(sprintf(
                'Failed to create micro app record for project %d',
                $projectId
            ));
        }

        return $record;
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

    public function paginateAccessible(
        string $userId,
        array $departmentIds,
        array $organizationCodes,
        MicroAppListScope $scope,
        string $keyword,
        int $page,
        int $pageSize
    ): array {
        if ($organizationCodes === []) {
            return ['total' => 0, 'list' => []];
        }

        $query = Db::table('magic_super_agent_micro_apps as ma')
            ->join('magic_super_agent_project as p', 'p.id', '=', 'ma.project_id')
            ->whereIn('p.user_organization_code', array_values(array_unique($organizationCodes)))
            ->where('p.project_status', 1)
            ->where('p.is_hidden', 0)
            ->whereNull('ma.deleted_at')
            ->whereNull('p.deleted_at')
            ->where(function ($accessQuery) use ($userId, $departmentIds): void {
                $accessQuery->where('p.user_id', $userId);

                $accessQuery->orWhere(function ($collaborationQuery) use ($userId, $departmentIds): void {
                    $collaborationQuery
                        ->where('p.user_id', '<>', $userId)
                        ->where('p.is_collaboration_enabled', 1)
                        ->whereExists(function ($memberQuery) use ($userId, $departmentIds): void {
                            $memberQuery
                                ->select(Db::raw('1'))
                                ->from('magic_super_agent_project_members as pm')
                                ->whereColumn('pm.project_id', 'p.id')
                                ->where('pm.status', 1)
                                ->whereNull('pm.deleted_at')
                                ->whereIn('pm.role', ['manage', 'editor', 'viewer'])
                                ->where(function ($targetQuery) use ($userId, $departmentIds): void {
                                    $targetQuery
                                        ->where(function ($userQuery) use ($userId): void {
                                            $userQuery
                                                ->where('pm.target_type', 'User')
                                                ->where('pm.target_id', $userId);
                                        });

                                    if ($departmentIds !== []) {
                                        $targetQuery->orWhere(function ($departmentQuery) use ($departmentIds): void {
                                            $departmentQuery
                                                ->where('pm.target_type', 'Department')
                                                ->whereIn('pm.target_id', $departmentIds);
                                        });
                                    }
                                });
                        });
                });
            });

        if ($keyword !== '') {
            $query->where('p.project_name', 'like', '%' . $keyword . '%');
        }

        switch ($scope) {
            case MicroAppListScope::Created:
                $query->where('ma.creator_id', $userId);
                break;
            case MicroAppListScope::Collaborated:
                $query
                    ->where('p.user_id', '<>', $userId)
                    ->where('ma.creator_id', '<>', $userId);
                break;
        }

        $total = (clone $query)->count('ma.id');
        $rows = $query
            ->select([
                'ma.id as app_id',
                'p.project_name as app_name',
                'p.project_description as app_description',
                'ma.creator_id',
                'ma.cover_file_key',
                'ma.publish_status',
                'p.updated_at',
                'p.user_organization_code as organization_code',
            ])
            ->orderBy('p.updated_at', 'desc')
            ->orderBy('ma.id', 'desc')
            ->offset(($page - 1) * $pageSize)
            ->limit($pageSize)
            ->get()
            ->map(static fn ($row): array => (array) $row)
            ->all();

        return ['total' => (int) $total, 'list' => $rows];
    }

    private function toEntity(MicroAppModel $model): MicroAppEntity
    {
        $data = $model->toArray();
        $data['target_ids'] = is_array($data['target_ids'] ?? null) ? $data['target_ids'] : [];

        return new MicroAppEntity($data);
    }
}
