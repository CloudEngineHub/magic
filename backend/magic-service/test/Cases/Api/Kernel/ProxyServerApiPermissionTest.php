<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Api\Kernel;

use App\Application\Kernel\Enum\MagicOperationEnum;
use App\Application\Kernel\Enum\MagicResourceEnum;
use App\Infrastructure\Util\Permission\Annotation\CheckPermission;
use Dtyq\MagicEnterprise\Application\Kernel\Enum\EnterpriseResourceEnum;
use Dtyq\MagicEnterprise\Interfaces\ProxyServer\Facade\AdminProxyServerApi;
use PHPUnit\Framework\TestCase;
use ReflectionMethod;

/**
 * @internal
 */
class ProxyServerApiPermissionTest extends TestCase
{
    public function testGetAllAllowsProxyServerAndPlatformModelQueryPermissions(): void
    {
        $permission = $this->getCheckPermission('getAll');

        $this->assertSame([
            EnterpriseResourceEnum::PLATFORM_PROXY_SERVER->value,
            MagicResourceEnum::PLATFORM_MODEL_TEXT->value,
            MagicResourceEnum::PLATFORM_MODEL_IMAGE->value,
            MagicResourceEnum::PLATFORM_MODEL_VIDEO->value,
        ], $permission->resource);
        $this->assertSame(MagicOperationEnum::QUERY->value, $permission->operation);
    }

    public function testQueriesKeepsDedicatedProxyServerPermission(): void
    {
        $permission = $this->getCheckPermission('queries');

        $this->assertSame([EnterpriseResourceEnum::PLATFORM_PROXY_SERVER->value], $permission->resource);
        $this->assertSame(MagicOperationEnum::QUERY->value, $permission->operation);
    }

    private function getCheckPermission(string $methodName): CheckPermission
    {
        $method = new ReflectionMethod(AdminProxyServerApi::class, $methodName);
        $attributes = $method->getAttributes(CheckPermission::class);

        $this->assertCount(1, $attributes);

        return $attributes[0]->newInstance();
    }
}
