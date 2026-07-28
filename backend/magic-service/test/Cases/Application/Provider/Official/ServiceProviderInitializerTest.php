<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Application\Provider\Official;

use App\Application\Provider\Official\ServiceProviderInitializer;
use App\Domain\Provider\Entity\ValueObject\ProviderCode;
use Hyperf\Contract\ConfigInterface;
use Hyperf\DbConnection\Db;
use PHPUnit\Framework\TestCase;

/**
 * @internal
 */
class ServiceProviderInitializerTest extends TestCase
{
    private const array NEW_PROVIDERS = [
        [ProviderCode::Tencent, 'llm'],
        [ProviderCode::Baidu, 'llm'],
        [ProviderCode::SCNet, 'llm'],
        [ProviderCode::Moonshot, 'llm'],
        [ProviderCode::BigModel, 'llm'],
        [ProviderCode::MiniMax, 'llm'],
        [ProviderCode::SiliconFlow, 'llm'],
        [ProviderCode::Keling, 'vgm'],
        [ProviderCode::VolcengineArk, 'vgm'],
    ];

    private mixed $originalOfficialOrganization;

    protected function setUp(): void
    {
        parent::setUp();

        $config = di(ConfigInterface::class);
        $this->originalOfficialOrganization = $config->get('service_provider.office_organization');
        $config->set('service_provider.office_organization', 'service-provider-initializer-test-org');
        Db::beginTransaction();
    }

    protected function tearDown(): void
    {
        Db::rollBack();
        di(ConfigInterface::class)->set('service_provider.office_organization', $this->originalOfficialOrganization);

        parent::tearDown();
    }

    public function testInitCreatesMissingProvidersWithoutChangingProviderConfigs(): void
    {
        foreach (self::NEW_PROVIDERS as [$providerCode, $category]) {
            Db::table('service_provider')
                ->where('provider_code', $providerCode->value)
                ->where('category', $category)
                ->whereNull('deleted_at')
                ->delete();
        }
        $providerConfigsBefore = $this->snapshotProviderConfigs();

        $result = ServiceProviderInitializer::init();

        self::assertTrue($result['success']);
        foreach (self::NEW_PROVIDERS as [$providerCode, $category]) {
            self::assertSame(1, Db::table('service_provider')
                ->where('provider_code', $providerCode->value)
                ->where('category', $category)
                ->whereNull('deleted_at')
                ->count());
        }
        self::assertSame($providerConfigsBefore, $this->snapshotProviderConfigs());
    }

    public function testInitIsIdempotentAndReturnsWellFormedMessage(): void
    {
        ServiceProviderInitializer::init();

        $result = ServiceProviderInitializer::init();

        self::assertTrue($result['success']);
        self::assertSame(0, $result['count']);
        self::assertSame(
            'Successfully initialized 0 items (providers: 0). Official video providers must be initialized manually via /api/v1/bootstrap/video-providers.',
            $result['message']
        );
        foreach (self::NEW_PROVIDERS as [$providerCode, $category]) {
            self::assertSame(1, Db::table('service_provider')
                ->where('provider_code', $providerCode->value)
                ->where('category', $category)
                ->whereNull('deleted_at')
                ->count());
        }
    }

    private function snapshotProviderConfigs(): string
    {
        return json_encode(
            Db::table('service_provider_configs')->orderBy('id')->get()->all(),
            JSON_THROW_ON_ERROR
        );
    }
}
