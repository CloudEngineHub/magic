<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Domain\AppMenu\Repository\Persistence\Model;

use App\Infrastructure\Core\AbstractModel;
use DateTime;
use Hyperf\Database\Model\SoftDeletes;
use Hyperf\Snowflake\Concern\Snowflake;

/**
 * @property int $id
 * @property int $app_menu_id 应用菜单ID
 * @property string $organization_code 组织编码
 * @property int $sort_order 组织内排序
 * @property int $status 组织内状态
 * @property string $creator_id 创建人ID
 * @property DateTime $created_at 创建时间
 * @property DateTime $updated_at 更新时间
 * @property null|DateTime $deleted_at 删除时间
 */
class AppMenuOrganizationOverrideModel extends AbstractModel
{
    use Snowflake;
    use SoftDeletes;

    protected ?string $table = 'magic_application_organization_overrides';

    protected array $fillable = [
        'id',
        'app_menu_id',
        'organization_code',
        'sort_order',
        'status',
        'creator_id',
        'created_at',
        'updated_at',
    ];

    protected array $casts = [
        'id' => 'integer',
        'app_menu_id' => 'integer',
        'organization_code' => 'string',
        'sort_order' => 'integer',
        'status' => 'integer',
        'creator_id' => 'string',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
        'deleted_at' => 'datetime',
    ];
}
