<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\SuperMagic\Task\Repository\Model;

use App\Infrastructure\Core\AbstractModel;

class SandboxKeepAliveModel extends AbstractModel
{
    public bool $incrementing = false;

    protected ?string $table = 'magic_super_agent_sandbox_keep_alive_topics';

    protected string $primaryKey = 'id';

    protected string $keyType = 'int';

    protected array $fillable = [
        'id',
        'user_id',
        'organization_code',
        'project_id',
        'topic_id',
        'sandbox_id',
        'is_enabled',
        'last_checked_at',
        'last_keepalive_at',
        'last_restarted_at',
        'last_status',
        'failure_count',
        'last_error',
        'deleted_at',
        'created_at',
        'updated_at',
    ];

    protected array $casts = [
        'id' => 'integer',
        'project_id' => 'integer',
        'topic_id' => 'integer',
        'is_enabled' => 'integer',
        'failure_count' => 'integer',
        'last_checked_at' => 'datetime',
        'last_keepalive_at' => 'datetime',
        'last_restarted_at' => 'datetime',
        'deleted_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];
}
