<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Domain\SuperAgent\Service;

use App\Domain\SuperMagic\Task\Service\AgentDomainService;
use App\Domain\SuperMagic\Task\Service\SandboxVersionDomainService;
use App\Domain\SuperMagic\Topic\Entity\TopicEntity;
use App\Domain\SuperMagic\Topic\Service\TopicDomainService;
use Hyperf\Codec\Packer\PhpSerializerPacker;
use Hyperf\Context\ApplicationContext;
use Hyperf\Logger\LoggerFactory;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Psr\Container\ContainerInterface;
use Psr\Log\NullLogger;
use RuntimeException;

/** @internal */
class SandboxVersionDomainServiceTest extends TestCase
{
    protected function setUp(): void
    {
        $container = $this->createMock(ContainerInterface::class);
        $container->method('get')->willReturn(new PhpSerializerPacker());
        ApplicationContext::setContainer($container);
    }

    #[DataProvider('imageCases')]
    public function testCompareCompleteReferences(?array $current, array $latest, ?bool $expected): void
    {
        $topic = (new TopicEntity())->setId(101)->setSandboxId('sandbox-101')->setAgentImage('legacy:v1');
        // Constructor hydration is also used by the topic repository.
        $topic = new TopicEntity(['id' => 101, 'sandbox_id' => 'sandbox-101', 'agent_image' => 'legacy:v1', 'sandbox_images' => $current]);
        $service = $this->service([$topic], $latest);
        self::assertSame($expected, $service->checkSandboxVersion(101)['needs_update']);
    }

    public static function imageCases(): array
    {
        $images = ['agent_image' => 'registry/agent:v1@sha256:aaa', 'agfs_image' => 'registry/agfs:v1'];
        return [
            'equal' => [$images, $images, false],
            'agent changed' => [array_replace($images, ['agent_image' => 'registry/agent:v2']), $images, true],
            'agfs changed' => [array_replace($images, ['agfs_image' => 'registry/agfs:v2']), $images, true],
            'digest changed' => [array_replace($images, ['agent_image' => 'registry/agent:v1@sha256:bbb']), $images, true],
            'repository changed' => [array_replace($images, ['agfs_image' => 'other/agfs:v1']), $images, true],
            'historical data' => [null, $images, null],
            'missing current agfs' => [['agent_image' => $images['agent_image']], $images, null],
            'empty standard' => [$images, [], null],
            'missing standard agfs' => [$images, ['agent_image' => $images['agent_image']], null],
            'invalid standard value' => [$images, array_replace($images, ['agfs_image' => []]), null],
            'blank standard value' => [$images, array_replace($images, ['agfs_image' => '  ']), null],
        ];
    }

    public function testGatewayFailureIsUnknown(): void
    {
        $topic = (new TopicEntity())->setId(101)->setSandboxId('sandbox-101');
        self::assertNull($this->service([$topic], new RuntimeException('unavailable'))->checkSandboxVersion(101)['needs_update']);
    }

    public function testBatchFetchesStandardOnceAndPreservesUnknown(): void
    {
        $images = ['agent_image' => 'agent:v1', 'agfs_image' => 'agfs:v1'];
        $topics = [
            new TopicEntity(['id' => 101, 'sandbox_id' => 's101', 'sandbox_images' => $images]),
            new TopicEntity(['id' => 102, 'sandbox_id' => 's102', 'agent_image' => 'agent:v1']),
            new TopicEntity(['id' => 103]),
        ];
        self::assertSame([101 => false, 102 => null, 103 => null], $this->service($topics, $images)->checkNeedUpgradeByTopicIds([101, 102, 103, 101, 0]));
    }

    private function service(array $topics, array|RuntimeException $latest): SandboxVersionDomainService
    {
        $topicService = $this->createMock(TopicDomainService::class);
        $topicService->method('getTopicById')->willReturn($topics[0]);
        $topicService->method('getTopicsByIds')->willReturn($topics);
        $agentService = $this->createMock(AgentDomainService::class);
        $method = $agentService->expects(self::once())->method('getLatestImages');
        if ($latest instanceof RuntimeException) {
            $method->willThrowException($latest);
        } else {
            $method->willReturn($latest);
        }
        $loggerFactory = $this->createMock(LoggerFactory::class);
        $loggerFactory->method('get')->willReturn(new NullLogger());
        return new SandboxVersionDomainService($topicService, $agentService, $loggerFactory);
    }
}
