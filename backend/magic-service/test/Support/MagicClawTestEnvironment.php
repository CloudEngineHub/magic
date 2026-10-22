<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Support;

use App\Infrastructure\Core\DataIsolation\OrganizationInfoManagerInterface;
use App\Infrastructure\Core\DataIsolation\SubscriptionManagerInterface;
use App\Infrastructure\Core\DataIsolation\ThirdPlatformDataIsolationManagerInterface;
use Hyperf\Context\ApplicationContext;
use Hyperf\Contract\ConfigInterface;
use Hyperf\Contract\TranslatorInterface;
use Psr\Container\ContainerInterface;

trait MagicClawTestEnvironment
{
    private function prepareClawEnvironment(array $extra = []): ContainerInterface
    {
        $translator = $this->createMock(TranslatorInterface::class);
        $translator->method('trans')->willReturn('Magic Claw runtime denied');
        $config = $this->createMock(ConfigInterface::class);
        $config->method('get')->willReturnCallback(static fn ($key, $default = null) => $key === 'app_env' ? 'test' : $default);
        $services = [TranslatorInterface::class => $translator, ConfigInterface::class => $config];
        foreach ([ThirdPlatformDataIsolationManagerInterface::class,
            SubscriptionManagerInterface::class,
            OrganizationInfoManagerInterface::class] as $interface) {
            $services[$interface] = $this->createMock($interface);
        }
        $services = $extra + $services;
        $container = new class($services) implements ContainerInterface {
            public function __construct(private array $services)
            {
            }

            public function get(string $id): mixed
            {
                return $this->services[$id];
            }

            public function has(string $id): bool
            {
                return isset($this->services[$id]);
            }

            public function make(string $id, array $parameters = []): mixed
            {
                return $this->get($id);
            }
        };
        ApplicationContext::setContainer($container);
        return $container;
    }
}
