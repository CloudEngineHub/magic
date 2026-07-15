<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SlidesTemplate\Factory;

use App\Domain\SlidesTemplate\Entity\SlidesTemplateTagRelationEntity;
use App\Domain\SlidesTemplate\Repository\Persistence\Model\SlidesTemplateTagRelationModel;

class SlidesTemplateTagRelationFactory
{
    public static function modelToEntity(SlidesTemplateTagRelationModel $model): SlidesTemplateTagRelationEntity
    {
        $entity = new SlidesTemplateTagRelationEntity();
        $entity->setId($model->id);
        $entity->setOrganizationCode($model->organization_code);
        $entity->setTemplateId($model->template_id);
        $entity->setTagId($model->tag_id);
        $entity->setCreatedUid($model->created_uid);
        return $entity;
    }
}
