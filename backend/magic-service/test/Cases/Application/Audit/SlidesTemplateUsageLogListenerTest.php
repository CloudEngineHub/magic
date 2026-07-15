<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Test\Cases\Application\Audit;

use App\Domain\Audit\ResourceAccess\Entity\ResourceAccessLogEntity;
use App\Domain\Audit\ResourceAccess\Repository\Facade\ResourceAccessLogRepositoryInterface;
use App\Domain\Audit\ResourceAccess\Service\ResourceAccessLogDomainService;
use App\Domain\SlidesTemplate\Entity\SlidesTemplateEntity;
use App\Domain\SlidesTemplate\Event\SlidesTemplateUsedEvent;
use App\Infrastructure\Audit\Listener\SlidesTemplateUsageLogListener;
use App\Infrastructure\Audit\Repository\Model\ResourceAccessLogModel;
use PHPUnit\Framework\TestCase;
use Psr\Container\ContainerInterface;
use ReflectionClass;
use RuntimeException;

/**
 * @internal
 */
class SlidesTemplateUsageLogListenerTest extends TestCase
{
    public function testProcessWritesSlidesTemplateUsageLog(): void
    {
        $repository = new RecordingResourceAccessLogRepository();
        $domainService = new ResourceAccessLogDomainService($repository);
        $listener = new SlidesTemplateUsageLogListener(new SlidesTemplateUsageLogListenerTestContainer($domainService));

        $template = new SlidesTemplateEntity();
        $template->setCode('PPT-business-minimal')
            ->setLabel(['zh_CN' => '职场白皮书', 'en_US' => 'Corporate Whitepaper'])
            ->setTemplateFileKey('slides/templates/business.zip');

        $listener->process(new SlidesTemplateUsedEvent(
            userId: 'user-1',
            organizationCode: 'DT001',
            userName: '张三',
            template: $template,
            accessContext: [
                'topic_id' => 'topic-1',
                'project_id' => 'project-1',
                'task_id' => 'task-1',
                'source' => 'super_magic_tool',
            ]
        ));

        $entity = $repository->entity;
        $this->assertInstanceOf(ResourceAccessLogEntity::class, $entity);
        $this->assertSame('DT001', $entity->getOrganizationCode());
        $this->assertSame('user-1', $entity->getUserId());
        $this->assertSame('张三', $entity->getUserName());
        $this->assertSame('tool', $entity->getActorType());
        $this->assertSame('slides_template', $entity->getResourceType());
        $this->assertSame('PPT-business-minimal', $entity->getResourceCode());
        $this->assertSame('职场白皮书', $entity->getResourceName());
        $this->assertSame('use', $entity->getOperation());
        $this->assertSame('super_magic_tool', $entity->getSource());
        $this->assertSame('topic-1', $entity->getContext()['topic_id']);
        $this->assertSame('project-1', $entity->getContext()['project_id']);
        $this->assertSame('task-1', $entity->getContext()['task_id']);
        $this->assertSame('super_magic_tool', $entity->getContext()['source']);
        $this->assertArrayNotHasKey('tool_call_id', $entity->getContext());
        $this->assertArrayNotHasKey('tool_name', $entity->getContext());
    }

    public function testDomainServiceDoesNotSwallowRepositoryFailure(): void
    {
        $domainService = new ResourceAccessLogDomainService(new FailingResourceAccessLogRepository());

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('save failed');

        $domainService->save(new ResourceAccessLogEntity());
    }

    public function testResourceAccessLogModelDoesNotExposeDroppedColumns(): void
    {
        $droppedColumns = [
            'user_agent',
            'ip',
            'resource_owner_organization_code',
            'source_detail',
            'status',
            'trace_id',
            'request_url',
            'resource_snapshot',
        ];

        $properties = (new ReflectionClass(ResourceAccessLogModel::class))->getDefaultProperties();

        $this->assertSame([], array_values(array_intersect($droppedColumns, $properties['fillable'])));
        $this->assertSame([], array_values(array_intersect($droppedColumns, array_keys($properties['casts']))));
    }
}

final readonly class SlidesTemplateUsageLogListenerTestContainer implements ContainerInterface
{
    public function __construct(
        private ResourceAccessLogDomainService $domainService
    ) {
    }

    public function get(string $id)
    {
        return match ($id) {
            ResourceAccessLogDomainService::class => $this->domainService,
            default => throw new RuntimeException('Unexpected container dependency: ' . $id),
        };
    }

    public function has(string $id): bool
    {
        return $id === ResourceAccessLogDomainService::class;
    }
}

final class RecordingResourceAccessLogRepository implements ResourceAccessLogRepositoryInterface
{
    public ?ResourceAccessLogEntity $entity = null;

    public function save(ResourceAccessLogEntity $entity): ResourceAccessLogEntity
    {
        $this->entity = $entity;
        return $entity;
    }
}

final class FailingResourceAccessLogRepository implements ResourceAccessLogRepositoryInterface
{
    public function save(ResourceAccessLogEntity $entity): ResourceAccessLogEntity
    {
        throw new RuntimeException('save failed');
    }
}
