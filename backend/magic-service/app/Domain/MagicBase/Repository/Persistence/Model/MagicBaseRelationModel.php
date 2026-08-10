<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Repository\Persistence\Model;

use App\Infrastructure\Core\AbstractModel;
use Hyperf\Snowflake\Concern\Snowflake;

class MagicBaseRelationModel extends AbstractModel
{
    use Snowflake;

    public bool $timestamps = false;

    protected ?string $table = 'magicbase_relations';

    protected array $fillable = [
        'id',
        'organization_code',
        'project_id',
        'source_table_id',
        'source_column_key',
        'target_table_id',
        'target_column_key',
        'relation_type',
        'relation_name',
        'created_at',
        'updated_at',
    ];

    protected array $casts = [
        'id' => 'integer',
        'organization_code' => 'string',
        'project_id' => 'integer',
        'source_table_id' => 'integer',
        'source_column_key' => 'string',
        'target_table_id' => 'integer',
        'target_column_key' => 'string',
        'relation_type' => 'string',
        'relation_name' => 'string',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];
}
