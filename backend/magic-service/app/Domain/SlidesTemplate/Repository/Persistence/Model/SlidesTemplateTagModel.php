<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SlidesTemplate\Repository\Persistence\Model;

use App\Infrastructure\Core\AbstractModel;
use Carbon\Carbon;
use Hyperf\Database\Model\SoftDeletes;

/**
 * @property int $id
 * @property string $organization_code
 * @property int $parent_id
 * @property string $node_type
 * @property null|string $usage_type
 * @property string $code
 * @property array $name_i18n
 * @property array $description_i18n
 * @property array $aliases_i18n
 * @property int $is_visible
 * @property int $status
 * @property int $sort
 * @property null|string $created_uid
 * @property null|string $updated_uid
 * @property null|Carbon $created_at
 * @property null|Carbon $updated_at
 * @property null|Carbon $deleted_at
 * @property null|int $template_count
 */
class SlidesTemplateTagModel extends AbstractModel
{
    use SoftDeletes;

    protected ?string $table = 'magic_slides_template_tags';

    protected array $fillable = [
        'id',
        'organization_code',
        'parent_id',
        'node_type',
        'usage_type',
        'code',
        'name_i18n',
        'description_i18n',
        'aliases_i18n',
        'is_visible',
        'status',
        'sort',
        'created_uid',
        'updated_uid',
    ];

    protected array $casts = [
        'id' => 'integer',
        'parent_id' => 'integer',
        'name_i18n' => 'array',
        'description_i18n' => 'array',
        'aliases_i18n' => 'array',
        'is_visible' => 'integer',
        'status' => 'integer',
        'sort' => 'integer',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
        'deleted_at' => 'datetime',
    ];
}
