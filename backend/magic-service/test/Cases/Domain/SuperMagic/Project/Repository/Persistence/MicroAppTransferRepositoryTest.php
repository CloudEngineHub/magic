<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Domain\SuperMagic\Project\Repository\Persistence;

use App\Domain\SuperMagic\Project\Entity\MicroAppEntity;
use App\Domain\SuperMagic\Project\Repository\Persistence\MicroAppTransferRepository;
use Hyperf\Context\ApplicationContext;
use Hyperf\Database\Connection;
use Hyperf\Database\ConnectionResolverInterface;
use Hyperf\Database\Query\Grammars\MySqlGrammar;
use Hyperf\DbConnection\Db;
use PHPUnit\Framework\TestCase;
use Psr\Container\ContainerInterface;
use Psr\EventDispatcher\EventDispatcherInterface;
use ReflectionProperty;
use RuntimeException;

/** @internal SQL is compiled against a fake connection; PDO must never be opened. */
final class MicroAppTransferRepositoryTest extends TestCase
{
    public function testTransferChangesOnlyScopedOwnershipAndInvalidatesShareScope(): void
    {
        $previous = ApplicationContext::hasContainer() ? ApplicationContext::getContainer() : null;
        $connection = $this->getMockBuilder(Connection::class)
            ->setConstructorArgs([static fn () => throw new RuntimeException('Real DB forbidden'), 'testing'])
            ->onlyMethods(['select', 'update'])->getMock();
        $connection->setQueryGrammar(new MySqlGrammar());
        $resolver = $this->createMock(ConnectionResolverInterface::class);
        $resolver->method('connection')->willReturn($connection);
        $container = $this->createMock(ContainerInterface::class);
        $events = $this->createMock(EventDispatcherInterface::class);
        $container->method('get')->willReturnCallback(static fn ($id) => match ($id) {
            ConnectionResolverInterface::class => $resolver,
            EventDispatcherInterface::class => $events,
            Db::class => new Db($container),
            default => throw new RuntimeException($id),
        });
        ApplicationContext::setContainer($container);
        $writes = [];
        $connection->expects(self::once())->method('select')->willReturnCallback(static function ($sql, $bindings) {
            self::assertStringContainsString('magic_resource_shares', $sql);
            self::assertStringContainsString('for update', strtolower($sql));
            self::assertStringNotContainsString('deleted_at', $sql);
            self::assertSame(['org', 12, 'resource-1'], $bindings);
            return [(object) ['id' => 100]];
        });
        $connection->expects(self::exactly(2))->method('update')->willReturnCallback(static function ($sql, $bindings) use (&$writes) {
            $writes[] = [$sql, $bindings];
            return 1;
        });
        try {
            (new MicroAppTransferRepository())->changeAppOwner(new MicroAppEntity([
                'id' => 30, 'resource_id' => 'resource-1', 'organization_code' => 'org', 'creator_id' => 'author',
            ]), 'receiver');
        } finally {
            if ($previous !== null) {
                ApplicationContext::setContainer($previous);
            } else {
                (new ReflectionProperty(ApplicationContext::class, 'container'))->setValue(null, null);
            }
        }
        self::assertStringContainsString('magic_super_agent_micro_apps', $writes[0][0]);
        self::assertStringNotContainsString('creator_id', $writes[0][0]);
        self::assertSame('receiver', $writes[0][1][0]);
        self::assertSame([30, 'org'], array_slice($writes[0][1], -2));
        $shareSql = $writes[1][0];
        self::assertStringContainsString('created_uid', $shareSql);
        self::assertStringContainsString('updated_uid', $shareSql);
        self::assertStringContainsString('scope_version + 1', $shareSql);
        self::assertStringNotContainsString('deleted_at', $shareSql);
        foreach (['share_code', 'password', 'expire_at', 'target_ids', 'share_range', 'extra'] as $preserved) {
            self::assertStringNotContainsString($preserved, $shareSql);
        }
        self::assertSame(['org', 12, 'resource-1', 100], array_slice($writes[1][1], -4));
    }
}
