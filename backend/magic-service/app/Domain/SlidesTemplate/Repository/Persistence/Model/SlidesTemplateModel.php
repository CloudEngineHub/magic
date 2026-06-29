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
 * @property string $code
 * @property array $label
 * @property array $description
 * @property string $thumbnail_file_key
 * @property null|string $collage_file_key
 * @property string $template_file_key
 * @property null|string $preview_url
 * @property int $status
 * @property int $sort
 * @property null|string $created_uid
 * @property null|string $updated_uid
 * @property null|Carbon $created_at
 * @property null|Carbon $updated_at
 * @property null|Carbon $deleted_at
 */
class SlidesTemplateModel extends AbstractModel
{
    use SoftDeletes;

    protected ?string $table = 'magic_slides_templates';

    protected array $fillable = [
        'id',
        'organization_code',
        'code',
        'label',
        'description',
        'thumbnail_file_key',
        'collage_file_key',
        'template_file_key',
        'preview_url',
        'status',
        'sort',
        'created_uid',
        'updated_uid',
    ];

    protected array $casts = [
        'id' => 'integer',
        'label' => 'array',
        'description' => 'array',
        'status' => 'integer',
        'sort' => 'integer',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
        'deleted_at' => 'datetime',
    ];
}
