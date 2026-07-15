<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SlidesTemplate\Repository\Persistence\Model;

use App\Infrastructure\Core\AbstractModel;
use Carbon\Carbon;

/**
 * @property int $id
 * @property string $organization_code
 * @property int $template_id
 * @property int $tag_id
 * @property null|string $created_uid
 * @property null|Carbon $created_at
 * @property null|Carbon $updated_at
 */
class SlidesTemplateTagRelationModel extends AbstractModel
{
    protected ?string $table = 'magic_slides_template_tag_relations';

    protected array $fillable = [
        'id',
        'organization_code',
        'template_id',
        'tag_id',
        'created_uid',
    ];

    protected array $casts = [
        'id' => 'integer',
        'template_id' => 'integer',
        'tag_id' => 'integer',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];
}
