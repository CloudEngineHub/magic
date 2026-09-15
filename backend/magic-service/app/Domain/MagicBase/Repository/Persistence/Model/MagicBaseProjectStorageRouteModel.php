<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Repository\Persistence\Model;

use App\Infrastructure\Core\AbstractModel;
use Hyperf\Snowflake\Concern\Snowflake;

class MagicBaseProjectStorageRouteModel extends AbstractModel
{
    use Snowflake;

    public bool $timestamps = false;

    protected ?string $table = 'magicbase_project_storage_routes';

    protected array $fillable = [
        'id',
        'organization_code',
        'project_id',
        'storage_driver',
        'mongo_database',
        'mongo_collection',
        'shard_id',
        'status',
        'created_at',
        'updated_at',
    ];

    protected array $casts = [
        'id' => 'integer',
        'organization_code' => 'string',
        'project_id' => 'integer',
        'storage_driver' => 'string',
        'mongo_database' => 'string',
        'mongo_collection' => 'string',
        'shard_id' => 'integer',
        'status' => 'string',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];
}
