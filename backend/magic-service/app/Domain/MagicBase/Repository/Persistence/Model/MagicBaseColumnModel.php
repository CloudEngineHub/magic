<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Repository\Persistence\Model;

use App\Infrastructure\Core\AbstractModel;
use Hyperf\Database\Model\SoftDeletes;
use Hyperf\Snowflake\Concern\Snowflake;

class MagicBaseColumnModel extends AbstractModel
{
    use Snowflake;
    use SoftDeletes;

    public bool $timestamps = false;

    protected ?string $table = 'magicbase_columns';

    protected array $fillable = [
        'id',
        'organization_code',
        'table_id',
        'column_key',
        'column_name',
        'data_type',
        'is_required',
        'default_value',
        'options',
        'status',
        'dynamic_permission',
        'created_at',
        'updated_at',
        'deleted_at',
    ];

    protected array $casts = [
        'id' => 'integer',
        'organization_code' => 'string',
        'table_id' => 'integer',
        'column_key' => 'string',
        'column_name' => 'string',
        'data_type' => 'string',
        'is_required' => 'boolean',
        'options' => 'array',
        'status' => 'string',
        'dynamic_permission' => 'array',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
        'deleted_at' => 'datetime',
    ];
}
