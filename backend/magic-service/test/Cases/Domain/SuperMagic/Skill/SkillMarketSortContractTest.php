<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Domain\SuperMagic\Skill;

use App\Domain\SuperMagic\Skill\Entity\SkillMarketEntity;
use App\Interfaces\SuperMagic\Skill\Assembler\SkillAssembler;
use App\Interfaces\SuperMagic\Skill\DTO\Response\SkillMarketListItemDTO;
use Hyperf\Codec\Packer\PhpSerializerPacker;
use Hyperf\Context\ApplicationContext;
use PHPUnit\Framework\TestCase;
use Psr\Container\ContainerInterface;
use RuntimeException;

/** @internal */
final class SkillMarketSortContractTest extends TestCase
{
    public static function setUpBeforeClass(): void
    {
        ApplicationContext::setContainer(new class implements ContainerInterface {
            public function get(string $id): mixed
            {
                if ($id === PhpSerializerPacker::class) {
                    return new PhpSerializerPacker();
                }

                throw new RuntimeException('Unsupported service: ' . $id);
            }

            public function has(string $id): bool
            {
                return $id === PhpSerializerPacker::class;
            }
        });
    }

    public function testMarketEntityExposesPersistedTotalInstallCount(): void
    {
        $market = new SkillMarketEntity([
            'id' => 7,
            'organization_code' => 'org',
            'skill_version_id' => 1,
            'skill_code' => 'skill-7',
            'publisher_id' => 'publisher-7',
            'install_count' => 2,
            'base_install_count' => 3,
            'total_install_count' => 5,
        ]);

        $this->assertSame(5, $market->getTotalInstallCount());
        $this->assertSame(5, $market->toArray()['total_install_count']);
    }

    public function testMarketListResponseContainsTotalInstallCountAndKeepsInstallCount(): void
    {
        $market = new SkillMarketEntity([
            'id' => 7,
            'organization_code' => 'org',
            'skill_version_id' => 1,
            'skill_code' => 'skill-7',
            'publisher_id' => 'publisher-7',
            'install_count' => 2,
            'base_install_count' => 3,
            'total_install_count' => 5,
        ]);

        $payload = SkillAssembler::createMarketListItemDTO($market)->jsonSerialize();

        $this->assertSame(5, $payload['install_count']);
        self::assertArrayNotHasKey('total_install_count', $payload);
    }

    public function testRepositoryUsesTotalInstallCountInPublicMarketOrdering(): void
    {
        $repositoryPath = dirname(__DIR__, 5) . '/app/Domain/SuperMagic/Skill/Repository/Persistence/SkillMarketRepository.php';
        $source = file_get_contents($repositoryPath);

        self::assertIsString($source);
        self::assertStringContainsString("orderBy('total_install_count', 'DESC')", $source);
    }

    public function testRepositoryUpdatesBothInstallCountersInOneStatement(): void
    {
        $repositoryPath = dirname(__DIR__, 5) . '/app/Domain/SuperMagic/Skill/Repository/Persistence/SkillMarketRepository.php';
        $source = file_get_contents($repositoryPath);

        self::assertIsString($source);
        self::assertStringContainsString("'install_count' => Db::raw('install_count + 1')", $source);
        self::assertStringContainsString("'total_install_count' => Db::raw('total_install_count + 1')", $source);
        self::assertStringContainsString("'total_install_count' => Db::raw('install_count + '", $source);
    }

    public function testMigrationBackfillsTotalInstallCountAndExtendsTheBusinessIndex(): void
    {
        $migrationPath = dirname(__DIR__, 5) . '/migrations/2026_08_28_120000_add_total_install_count_to_magic_skill_market_table.php';
        $source = file_get_contents($migrationPath);

        self::assertIsString($source);
        self::assertStringContainsString('SET total_install_count = install_count + base_install_count', $source);
        self::assertStringContainsString("['is_featured', 'sort_order', 'total_install_count', 'id']", $source);
    }

    public function testInstallDispatchesVectorPayloadRefreshAfterCommit(): void
    {
        $servicePath = dirname(__DIR__, 5) . '/app/Application/SuperMagic/Skill/Service/SkillAppService.php';
        $source = file_get_contents($servicePath);

        self::assertIsString($source);
        $commitPosition = strpos($source, 'Db::commit();', strpos($source, 'function addSkillFromStore'));
        $eventPosition = strpos($source, 'new SkillMarketInstalledEvent(', $commitPosition ?: 0);

        self::assertIsInt($commitPosition);
        self::assertIsInt($eventPosition);
        self::assertGreaterThan($commitPosition, $eventPosition);
    }

    public function testVectorSyncSubscriberListensForSkillMarketInstalledEvent(): void
    {
        $subscriberPath = dirname(__DIR__, 5) . '/app/Application/SuperMagic/Skill/Event/Subscribe/SkillMarketVectorIndexSyncSubscriber.php';
        $source = file_get_contents($subscriberPath);

        self::assertIsString($source);
        self::assertStringContainsString('SkillMarketInstalledEvent::class', $source);
        self::assertStringContainsString('instanceof SkillMarketInstalledEvent', $source);
    }

    public function testSkillUsageEventsAreOnlyEnabledForSandboxFileUrlRequests(): void
    {
        $servicePath = dirname(__DIR__, 5) . '/app/Application/SuperMagic/Skill/Service/SkillAppService.php';
        $sandboxApiPath = dirname(__DIR__, 5) . '/app/Interfaces/SuperMagic/Agent/Facade/Sandbox/SkillSandboxApi.php';
        $skillApiPath = dirname(__DIR__, 5) . '/app/Interfaces/SuperMagic/Skill/Facade/SkillApi.php';

        $serviceSource = file_get_contents($servicePath);
        $sandboxApiSource = file_get_contents($sandboxApiPath);
        $skillApiSource = file_get_contents($skillApiPath);

        self::assertIsString($serviceSource);
        self::assertIsString($sandboxApiSource);
        self::assertIsString($skillApiSource);
        self::assertStringContainsString('getSkillFileUrlsByIdsForSandbox', $serviceSource);
        self::assertStringContainsString('getSkillFileUrlsByIdsForSandbox($requestContext, $requestDTO)', $sandboxApiSource);
        self::assertStringContainsString('getSkillFileUrlsByIds($requestContext, $requestDTO)', $skillApiSource);
        self::assertStringNotContainsString('getSkillFileUrlsByIds($requestContext, $requestDTO,', $skillApiSource);
    }

    public function testDtoConstructorRemainsCompatibleWithExistingInstallCountArgument(): void
    {
        $dto = new SkillMarketListItemDTO(
            1,
            'skill',
            'skill',
            'name',
            'description',
            'source',
            [],
            [],
            [],
            '',
            'USER',
            [],
            'PUBLISHED',
            false,
            false,
            false,
            false,
            '',
            '',
            '',
            null,
            '',
            '',
            42,
        );

        self::assertSame(42, $dto->jsonSerialize()['install_count']);
    }
}
