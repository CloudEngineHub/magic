<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Repository\Persistence\Model;

use App\Infrastructure\Core\AbstractModel;
use Hyperf\Snowflake\Concern\Snowflake;

class MagicBaseMigrationLogModel extends AbstractModel
{
    use Snowflake;

    public bool $timestamps = false;

    protected ?string $table = 'magicbase_schema_migration_logs';

    protected array $fillable = [
        'id',
        'organization_code',
        'project_id',
        'table_id',
        'change_type',
        'target_type',
        'target_id',
        'source_type',
        'source_ref',
        'before_json',
        'after_json',
        'operator_id',
        'operator_name',
        'request_id',
        'remark',
        'created_at',
    ];

    protected array $casts = [
        'id' => 'integer',
        'organization_code' => 'string',
        'project_id' => 'integer',
        'table_id' => 'integer',
        'change_type' => 'string',
        'target_type' => 'string',
        'target_id' => 'integer',
        'source_type' => 'string',
        'source_ref' => 'string',
        'before_json' => 'array',
        'after_json' => 'array',
        'operator_id' => 'string',
        'operator_name' => 'string',
        'request_id' => 'string',
        'remark' => 'string',
        'created_at' => 'datetime',
    ];
}
