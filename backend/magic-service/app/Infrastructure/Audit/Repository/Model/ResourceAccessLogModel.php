<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\Audit\Repository\Model;

use App\Infrastructure\Core\AbstractModel;
use Carbon\Carbon;

/**
 * @property int $id
 * @property string $organization_code
 * @property string $user_id
 * @property string $user_name
 * @property string $actor_type
 * @property string $resource_type
 * @property string $resource_code
 * @property null|string $resource_name
 * @property string $operation
 * @property string $source
 * @property null|string $request_id
 * @property array $context
 * @property null|Carbon $created_at
 * @property null|Carbon $updated_at
 */
class ResourceAccessLogModel extends AbstractModel
{
    public bool $timestamps = true;

    protected ?string $table = 'magic_resource_access_logs';

    protected string $primaryKey = 'id';

    protected array $fillable = [
        'organization_code',
        'user_id',
        'user_name',
        'actor_type',
        'resource_type',
        'resource_code',
        'resource_name',
        'operation',
        'source',
        'request_id',
        'context',
        'created_at',
        'updated_at',
    ];

    protected array $casts = [
        'id' => 'integer',
        'organization_code' => 'string',
        'user_id' => 'string',
        'user_name' => 'string',
        'actor_type' => 'string',
        'resource_type' => 'string',
        'resource_code' => 'string',
        'resource_name' => 'string',
        'operation' => 'string',
        'source' => 'string',
        'request_id' => 'string',
        'context' => 'array',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];
}
