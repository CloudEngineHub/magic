<?php

declare(strict_types=1);

namespace App\Domain\Asset\Repository\Persistence;

use App\Domain\Asset\Entity\AssetDataIsolation;
use App\Domain\Asset\Entity\AssetTagEntity;
use App\Domain\Asset\Factory\AssetTagFactory;
use App\Domain\Asset\Repository\Facade\AssetTagRepositoryInterface;
use App\Domain\Asset\Repository\Persistence\Model\AssetTagModel;
use App\Infrastructure\Util\IdGenerator\IdGenerator;

class AssetTagRepository implements AssetTagRepositoryInterface
{
    public function queryVisible(AssetDataIsolation $dataIsolation, ?string $ownerUid = null): array
    {
        $builder = AssetTagModel::query()->whereIn('organization_code', $dataIsolation->getOrganizationCodes())->where('status', 1);
        $builder->where(static function ($query) use ($ownerUid): void {
            $query->whereNull('owner_uid');
            if ($ownerUid !== null && $ownerUid !== '') {
                $query->orWhere('owner_uid', $ownerUid);
            }
        });
        return $builder->orderBy('sort', 'desc')->orderBy('id', 'desc')->get()->map(static fn (AssetTagModel $model) => AssetTagFactory::modelToEntity($model))->all();
    }

    public function queryVisibleTree(AssetDataIsolation $dataIsolation, ?string $ownerUid = null): array
    {
        $nodes = $this->queryVisible($dataIsolation, $ownerUid);
        $groups = [];
        $tags = [];
        foreach ($nodes as $node) {
            if ($node->isGroup()) {
                $groups[(string) $node->getId()] = $node;
            } elseif ($node->isTag()) {
                $tags[] = $node;
            }
        }
        foreach ($tags as $tag) {
            $group = $groups[(string) $tag->getParentId()] ?? null;
            if ($group !== null) {
                $group->setChildren([...$group->getChildren(), $tag]);
            }
        }
        return array_values($groups);
    }

    public function findById(AssetDataIsolation $dataIsolation, int|string $id): ?AssetTagEntity
    {
        $model = AssetTagModel::query()->whereIn('organization_code', $dataIsolation->getOrganizationCodes())->where('id', $id)->first();
        return $model ? AssetTagFactory::modelToEntity($model) : null;
    }

    public function save(AssetDataIsolation $dataIsolation, AssetTagEntity $entity): AssetTagEntity
    {
        $entity->setOrganizationCode($entity->getOrganizationCode() ?: $dataIsolation->getCurrentOrganizationCode());
        $model = $entity->getId()
            ? AssetTagModel::query()->whereIn('organization_code', $dataIsolation->getOrganizationCodes())->where('id', $entity->getId())->first()
            : new AssetTagModel();
        $model ??= new AssetTagModel();
        if (! $entity->getId()) { $entity->setId(IdGenerator::getSnowId()); }
        $model->fill($entity->toArray());
        $model->save();
        return AssetTagFactory::modelToEntity($model);
    }

    public function delete(AssetDataIsolation $dataIsolation, int|string $id, ?string $ownerUid = null): bool
    {
        $builder = AssetTagModel::query()->whereIn('organization_code', $dataIsolation->getOrganizationCodes())->where('id', $id);
        if ($ownerUid !== null) { $builder->where('owner_uid', $ownerUid); }
        return (bool) $builder->first()?->delete();
    }

    public function hasChildren(AssetDataIsolation $dataIsolation, int|string $parentId): bool
    {
        return AssetTagModel::query()
            ->whereIn('organization_code', $dataIsolation->getOrganizationCodes())
            ->where('parent_id', $parentId)
            ->where('status', 1)
            ->exists();
    }
}
