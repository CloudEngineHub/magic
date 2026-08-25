<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Application\ModelGateway\Mapper;

use App\Application\ModelGateway\Mapper\ModelGatewayMapper;
use App\Domain\Permission\Entity\ValueObject\ModelAccessContext;
use App\Domain\Permission\Entity\ValueObject\PermissionControlStatus;
use PHPUnit\Framework\TestCase;
use ReflectionClass;

/**
 * 验证模型列表使用用户模型权限上下文进行可见性判断。
 *
 * @internal
 */
class ModelGatewayMapperAccessTest extends TestCase
{
    /**
     * 权限控制关闭时保持原有的全量模型可见行为。
     */
    public function testModelIsAccessibleWhenPermissionControlIsDisabled(): void
    {
        $context = new ModelAccessContext(PermissionControlStatus::DISABLED, ['model-a'], []);

        $this->assertTrue($this->invokeIsModelAccessible($context, 'model-a'));
    }

    /**
     * 权限控制开启时拒绝列表中的模型。
     */
    public function testModelIsNotAccessibleWhenPermissionControlDeniesIt(): void
    {
        $context = new ModelAccessContext(
            PermissionControlStatus::ENABLED,
            ['model-a'],
            ['model-b']
        );

        $this->assertFalse($this->invokeIsModelAccessible($context, 'model-a'));
        $this->assertTrue($this->invokeIsModelAccessible($context, 'model-b'));
    }

    /**
     * 未传权限上下文时兼容原有的内部模型加载调用方。
     */
    public function testModelIsAccessibleWithoutAccessContext(): void
    {
        $this->assertTrue($this->invokeIsModelAccessible(null, 'model-a'));
    }

    /**
     * 通过反射调用 mapper 内部的模型可见性策略，避免初始化外部服务依赖。
     */
    private function invokeIsModelAccessible(?ModelAccessContext $context, string $modelId): bool
    {
        $mapper = (new ReflectionClass(ModelGatewayMapper::class))->newInstanceWithoutConstructor();
        $method = new ReflectionClass(ModelGatewayMapper::class)->getMethod('isModelAccessible');
        $method->setAccessible(true);

        return $method->invoke($mapper, $context, $modelId);
    }
}
