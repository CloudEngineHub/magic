<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Repository\Persistence\Model;

use App\Infrastructure\Core\AbstractModel;
use Hyperf\Database\Model\SoftDeletes;
use Hyperf\Snowflake\Concern\Snowflake;

class MagicBaseTableModel extends AbstractModel
{
    use Snowflake;
    use SoftDeletes;

    public bool $timestamps = false;

    protected ?string $table = 'magicbase_tables';

    protected array $fillable = [
        'id',
        'organization_code',
        'project_id',
        'table_key',
        'table_name',
        'description',
        'status',
        'dynamic_permissions',
        'created_by',
        'created_at',
        'updated_at',
        'deleted_at',
    ];

    protected array $casts = [
        'id' => 'integer',
        'organization_code' => 'string',
        'project_id' => 'integer',
        'table_key' => 'string',
        'table_name' => 'string',
        'description' => 'string',
        'status' => 'string',
        'dynamic_permissions' => 'array',
        'created_by' => 'string',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
        'deleted_at' => 'datetime',
    ];
}
