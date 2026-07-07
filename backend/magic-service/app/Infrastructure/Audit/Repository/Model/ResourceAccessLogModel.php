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
 * @property null|string $resource_owner_organization_code
 * @property string $operation
 * @property string $source
 * @property null|string $source_detail
 * @property string $status
 * @property null|string $ip
 * @property null|string $user_agent
 * @property null|string $request_url
 * @property null|string $request_id
 * @property null|string $trace_id
 * @property array $context
 * @property array $resource_snapshot
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
        'resource_owner_organization_code',
        'operation',
        'source',
        'source_detail',
        'status',
        'ip',
        'user_agent',
        'request_url',
        'request_id',
        'trace_id',
        'context',
        'resource_snapshot',
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
        'resource_owner_organization_code' => 'string',
        'operation' => 'string',
        'source' => 'string',
        'source_detail' => 'string',
        'status' => 'string',
        'ip' => 'string',
        'user_agent' => 'string',
        'request_url' => 'string',
        'request_id' => 'string',
        'trace_id' => 'string',
        'context' => 'array',
        'resource_snapshot' => 'array',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];
}
