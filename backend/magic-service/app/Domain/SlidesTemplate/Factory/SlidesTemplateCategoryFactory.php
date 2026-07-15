<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SlidesTemplate\Factory;

use App\Domain\SlidesTemplate\Entity\SlidesTemplateCategoryEntity;
use App\Domain\SlidesTemplate\Repository\Persistence\Model\SlidesTemplateCategoryModel;

class SlidesTemplateCategoryFactory
{
    public static function modelToEntity(SlidesTemplateCategoryModel $model): SlidesTemplateCategoryEntity
    {
        $entity = new SlidesTemplateCategoryEntity();
        $entity->setId($model->id);
        $entity->setOrganizationCode($model->organization_code);
        $entity->setCode($model->code);
        $entity->setNameI18n($model->name_i18n ?? []);
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
