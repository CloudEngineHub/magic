<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\MagicBase\Repository\Persistence\Model;

use App\Infrastructure\Core\AbstractModel;
use Hyperf\Snowflake\Concern\Snowflake;

class MagicBaseRowPermissionModel extends AbstractModel
{
    use Snowflake;

    public bool $timestamps = false;

    protected ?string $table = 'magicbase_row_permissions';

    protected array $fillable = [
        'id',
        'organization_code',
        'table_id',
        'record_id',
        'subject_type',
        'subject_id',
        'can_read',
        'can_edit',
        'can_delete',
        'created_at',
        'updated_at',
    ];

    protected array $casts = [
        'id' => 'integer',
        'organization_code' => 'string',
        'table_id' => 'integer',
        'record_id' => 'integer',
        'subject_type' => 'string',
        'subject_id' => 'string',
        'can_read' => 'boolean',
        'can_edit' => 'boolean',
        'can_delete' => 'boolean',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];
}
