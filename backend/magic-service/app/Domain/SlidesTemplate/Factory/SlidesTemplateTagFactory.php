<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SlidesTemplate\Factory;

use App\Domain\SlidesTemplate\Entity\SlidesTemplateTagEntity;
use App\Domain\SlidesTemplate\Repository\Persistence\Model\SlidesTemplateTagModel;

class SlidesTemplateTagFactory
{
    public static function modelToEntity(SlidesTemplateTagModel $model): SlidesTemplateTagEntity
    {
        $entity = new SlidesTemplateTagEntity();
        $entity->setId($model->id);
        $entity->setOrganizationCode($model->organization_code);
        $entity->setParentId($model->parent_id ?? 0);
        $nodeType = $model->node_type ?? 'tag';
        $entity->setNodeType($nodeType);
        $entity->setUsageType($nodeType === 'group' ? null : ($model->usage_type ?? 'filter'));
        $entity->setCode($model->code);
        $entity->setNameI18n($model->name_i18n ?? []);
        $entity->setDescriptionI18n($model->description_i18n ?? []);
        $entity->setAliasesI18n($model->aliases_i18n ?? []);
        $entity->setIsVisible($model->is_visible ?? 1);
        $entity->setStatus($model->status);
        $entity->setSort($model->sort);
        $entity->setCreatedUid($model->created_uid);
        $entity->setUpdatedUid($model->updated_uid);
        $entity->setCreatedAt($model->created_at?->toDateTimeString());
        $entity->setUpdatedAt($model->updated_at?->toDateTimeString());
        $entity->setDeletedAt($model->deleted_at?->toDateTimeString());
        $entity->setTemplateCount($model->template_count ?? 0);
        return $entity;
    }
}
