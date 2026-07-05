<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\AppMenu;

use App\Application\AppMenu\Service\AppMenuAppService;
use App\Domain\AppMenu\Entity\AppMenuEntity;
use App\Domain\AppMenu\Entity\ValueObject\AppMenuStatus;
use App\Interfaces\Admin\Facade\AppMenu\AppMenuAdminApi;
use App\Interfaces\Authorization\Web\MagicUserAuthorization;
use Hyperf\HttpServer\Contract\RequestInterface;
use HyperfTest\HttpTestCase;
use Mockery;
use PHPUnit\Framework\Assert;
use ReflectionMethod;
use ReflectionProperty;

/**
 * @internal
 */
class AppMenuAdminApiTest extends HttpTestCase
{
    public function testOverrideOnlyPayloadPreservesSortOrderWhenStatusOnlySubmitted(): void
    {
        $currentEntity = new AppMenuEntity();
        $currentEntity->setSortOrder(888);
        $currentEntity->setStatus(AppMenuStatus::Disabled->value);

        $payload = $this->normalizeOverrideOnlyPayload($currentEntity, [
            'id' => '100',
            'override_only' => true,
            'status' => AppMenuStatus::Enabled->value,
        ]);

        self::assertSame(888, $payload['sort_order']);
        self::assertSame(AppMenuStatus::Enabled->value, $payload['status']);
    }

    public function testOverrideOnlyPayloadPreservesStatusWhenSortOrderOnlySubmitted(): void
    {
        $currentEntity = new AppMenuEntity();
        $currentEntity->setSortOrder(888);
        $currentEntity->setStatus(AppMenuStatus::Disabled->value);

        $payload = $this->normalizeOverrideOnlyPayload($currentEntity, [
            'id' => '100',
            'override_only' => true,
            'sort_order' => 321,
        ]);

        self::assertSame(321, $payload['sort_order']);
        self::assertSame(AppMenuStatus::Disabled->value, $payload['status']);
    }

    /**
     * @param array<string, mixed> $payload
     * @return array<string, mixed>
     */
    private function normalizeOverrideOnlyPayload(AppMenuEntity $currentEntity, array $payload): array
    {
        $authorization = (new MagicUserAuthorization())
            ->setId('app_menu_admin_api_test')
            ->setOrganizationCode('app_menu_admin_api_org');

        $appMenuAppService = new class($currentEntity) extends AppMenuAppService {
            public int $showCalls = 0;

            public function __construct(private readonly AppMenuEntity $currentEntity)
            {
            }

            public function show(MagicUserAuthorization $authorization, int $id): AppMenuEntity
            {
                Assert::assertSame('app_menu_admin_api_org', $authorization->getOrganizationCode());
                Assert::assertSame(100, $id);
                ++$this->showCalls;

                return $this->currentEntity;
            }
        };

        /** @var RequestInterface $request */
        $request = Mockery::mock(RequestInterface::class);
        $api = new AppMenuAdminApi($request);
        $property = new ReflectionProperty($api, 'appMenuAppService');
        $property->setAccessible(true);
        $property->setValue($api, $appMenuAppService);

        $method = new ReflectionMethod($api, 'normalizeOverrideOnlyPayload');
        $method->setAccessible(true);
        /** @var array<string, mixed> $normalizedPayload */
        $normalizedPayload = $method->invoke($api, $authorization, $payload);
        self::assertSame(1, $appMenuAppService->showCalls);

        return $normalizedPayload;
    }
}
