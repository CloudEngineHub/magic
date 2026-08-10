<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SuperMagic\Project\Repository\Model;

use App\Infrastructure\Core\AbstractModel;
use Carbon\Carbon;
use Hyperf\Database\Model\SoftDeletes;

/**
 * @property int $id
 * @property int $project_id
 * @property string $resource_id
 * @property null|int $share_id
 * @property null|string $share_code
 * @property string $organization_code
 * @property string $user_id
 * @property string $creator_id
 * @property null|string $cover_file_key
 * @property int $share_type
 * @property null|string $share_range
 * @property array $target_ids
 * @property string $publish_status
 * @property string $access_url
 * @property null|Carbon $published_at
 * @property null|Carbon $unpublished_at
 * @property null|Carbon $created_at
 * @property null|Carbon $updated_at
 * @property null|Carbon $deleted_at
 */
class MicroAppModel extends AbstractModel
{
    use SoftDeletes;

    protected ?string $table = 'magic_super_agent_micro_apps';

    protected array $fillable = [
        'id',
        'project_id',
        'resource_id',
        'share_id',
        'share_code',
        'organization_code',
        'user_id',
        'creator_id',
        'cover_file_key',
        'share_type',
        'share_range',
        'target_ids',
        'publish_status',
        'access_url',
        'published_at',
        'unpublished_at',
        'created_at',
        'updated_at',
    ];

    protected array $casts = [
        'id' => 'integer',
        'project_id' => 'integer',
        'share_id' => 'integer',
        'share_type' => 'integer',
        'target_ids' => 'array',
        'published_at' => 'datetime',
        'unpublished_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
        'deleted_at' => 'datetime',
    ];
}
