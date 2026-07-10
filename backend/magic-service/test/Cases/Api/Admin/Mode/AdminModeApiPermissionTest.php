<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Api\Admin\Mode;

use App\Application\Kernel\Enum\MagicOperationEnum;
use App\Application\Kernel\Enum\MagicResourceEnum;
use App\Infrastructure\Util\Permission\Annotation\CheckPermission;
use App\Interfaces\Mode\Facade\AdminModeApi;
use PHPUnit\Framework\TestCase;
use ReflectionMethod;

/**
 * @internal
 */
class AdminModeApiPermissionTest extends TestCase
{
    public function testGetModesAllowsOfficialAgentAndLegacyAiModePermissions(): void
    {
        $method = new ReflectionMethod(AdminModeApi::class, 'getModes');
        $attributes = $method->getAttributes(CheckPermission::class);

        $this->assertCount(1, $attributes);

        /** @var CheckPermission $permission */
        $permission = $attributes[0]->newInstance();

        $this->assertSame([
            MagicResourceEnum::PLATFORM_AGENT_OFFICIAL->value,
            MagicResourceEnum::ADMIN_AI_MODE->value,
        ], $permission->resource);
        $this->assertSame(MagicOperationEnum::QUERY->value, $permission->operation);
    }
}
