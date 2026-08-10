<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Repository\Persistence\Model;

use App\Infrastructure\Core\AbstractModel;
use Hyperf\Snowflake\Concern\Snowflake;

class MagicBaseColumnPermissionModel extends AbstractModel
{
    use Snowflake;

    public bool $timestamps = false;

    protected ?string $table = 'magicbase_column_permissions';

    protected array $fillable = [
        'id',
        'organization_code',
        'table_id',
        'column_id',
        'subject_type',
        'subject_id',
        'can_read',
        'can_edit',
        'created_at',
        'updated_at',
    ];

    protected array $casts = [
        'id' => 'integer',
        'organization_code' => 'string',
        'table_id' => 'integer',
        'column_id' => 'integer',
        'subject_type' => 'string',
        'subject_id' => 'string',
        'can_read' => 'boolean',
        'can_edit' => 'boolean',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];
}
