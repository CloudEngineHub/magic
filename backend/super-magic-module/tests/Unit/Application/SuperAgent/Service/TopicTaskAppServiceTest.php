<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Tests\Unit\Application\SuperAgent\Service;

use App\Domain\Chat\DTO\Message\Common\MessageExtra\SuperAgent\SuperAgentExtra;
use App\Domain\Contact\Entity\ValueObject\DataIsolation;
use App\Infrastructure\Core\Exception\BusinessException;
use Dtyq\SuperMagic\Application\SuperAgent\Service\TopicTaskAppService;
use Dtyq\SuperMagic\Domain\SuperAgent\Entity\TaskEntity;
use Dtyq\SuperMagic\Domain\SuperAgent\Entity\TopicEntity;
use Dtyq\SuperMagic\Domain\SuperAgent\Service\TaskDomainService;
use Dtyq\SuperMagic\Domain\SuperAgent\Service\TopicDomainService;
use Dtyq\SuperMagic\ErrorCode\SuperAgentErrorCode;
use Dtyq\SuperMagic\Interfaces\SuperAgent\DTO\TopicTaskMessageDTO;
use PHPUnit\Framework\TestCase;
use ReflectionClass;
use ReflectionMethod;

/**
 * @internal
 */
class TopicTaskAppServiceTest extends TestCase
{
    public function testRequestSmaTopicPatternOverridesThePersistedAgentCode(): void
    {
        $service = (new ReflectionClass(TopicTaskAppService::class))->newInstanceWithoutConstructor();
        $method = new ReflectionMethod(TopicTaskAppService::class, 'resolveEffectiveAgentCode');
        $method->setAccessible(true);

        $topic = new TopicEntity(['agent_code' => 'SMA-persisted']);
        $extra = new SuperAgentExtra();
        $extra->setTopicPattern('SMA-request');

        $this->assertSame('SMA-request', $method->invoke($service, $topic, $extra));
    }

    public function testDeliveredMessageAuthorizationRejectsTaskOwnedByAnotherUser(): void
    {
        $service = (new ReflectionClass(TopicTaskAppService::class))->newInstanceWithoutConstructor();
        $method = new ReflectionMethod(TopicTaskAppService::class, 'getAuthorizedTaskAndTopic');
        $method->setAccessible(true);

        $dataIsolation = $this->createDataIsolation('ORG-A', 'USER-A');
        $task = new TaskEntity([
            'id' => 1001,
            'user_id' => 'USER-B',
            'topic_id' => 2001,
            'sandbox_id' => 'sandbox-b',
        ]);
        $taskDomainService = $this->createMock(TaskDomainService::class);
        $taskDomainService->expects($this->once())->method('getTaskById')->with(1001)->willReturn($task);
        $topicDomainService = $this->createMock(TopicDomainService::class);
        $topicDomainService->expects($this->never())->method('getTopicById');
        $this->setServiceProperty($service, 'taskDomainService', $taskDomainService);
        $this->setServiceProperty($service, 'topicDomainService', $topicDomainService);
        $messageDTO = TopicTaskMessageDTO::fromArray([
            'metadata' => ['super_magic_task_id' => '1001', 'sandbox_id' => 'sandbox-b'],
        ]);

        try {
            $method->invoke($service, $dataIsolation, $messageDTO);
            $this->fail('Expected authorization failure');
        } catch (BusinessException $exception) {
            $this->assertSame(SuperAgentErrorCode::TASK_ACCESS_DENIED->value, $exception->getCode());
        }
    }

    public function testDeliveredMessageAuthorizationAcceptsMatchingContext(): void
    {
        $service = (new ReflectionClass(TopicTaskAppService::class))->newInstanceWithoutConstructor();
        $method = new ReflectionMethod(TopicTaskAppService::class, 'getAuthorizedTaskAndTopic');
        $method->setAccessible(true);

        $dataIsolation = $this->createDataIsolation('ORG-A', 'USER-A');
        $task = new TaskEntity([
            'id' => 1001,
            'user_id' => 'USER-A',
            'topic_id' => 2001,
            'project_id' => 3001,
            'sandbox_id' => 'sandbox-a',
        ]);
        $topic = new TopicEntity([
            'id' => 2001,
            'user_id' => 'USER-A',
            'user_organization_code' => 'ORG-A',
            'project_id' => 3001,
            'current_task_id' => 1001,
            'sandbox_id' => 'sandbox-a',
        ]);

        $taskDomainService = $this->createMock(TaskDomainService::class);
        $taskDomainService->expects($this->once())->method('getTaskById')->with(1001)->willReturn($task);
        $topicDomainService = $this->createMock(TopicDomainService::class);
        $topicDomainService->expects($this->once())->method('getTopicById')->with(2001)->willReturn($topic);
        $this->setServiceProperty($service, 'taskDomainService', $taskDomainService);
        $this->setServiceProperty($service, 'topicDomainService', $topicDomainService);
        $messageDTO = TopicTaskMessageDTO::fromArray([
            'metadata' => ['super_magic_task_id' => '1001', 'sandbox_id' => 'untrusted-sandbox'],
        ]);

        [$authorizedTask, $authorizedTopic] = $method->invoke($service, $dataIsolation, $messageDTO);
        $this->assertSame($task, $authorizedTask);
        $this->assertSame($topic, $authorizedTopic);
    }

    private function createDataIsolation(string $organizationCode, string $userId): DataIsolation
    {
        $dataIsolation = new DataIsolation();
        $dataIsolation->setCurrentOrganizationCode($organizationCode);
        $dataIsolation->setCurrentUserId($userId);
        return $dataIsolation;
    }

    private function setServiceProperty(TopicTaskAppService $service, string $name, object $value): void
    {
        $property = new \ReflectionProperty(TopicTaskAppService::class, $name);
        $property->setAccessible(true);
        $property->setValue($service, $value);
    }
}
