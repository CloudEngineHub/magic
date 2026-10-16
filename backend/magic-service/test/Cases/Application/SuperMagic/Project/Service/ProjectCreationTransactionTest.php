<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace HyperfTest\Cases\Application\SuperMagic\Project\Service;

use App\Application\SuperMagic\File\DTO\Request\CreateAudioProjectRequestDTO;
use App\Application\SuperMagic\Project\DTO\Request\CreateAgentProjectRequestDTO;
use App\Application\SuperMagic\Project\DTO\Request\CreateMicroAppProjectRequestDTO;
use App\Application\SuperMagic\Project\Service\ProjectAppService;
use App\Domain\Contact\Entity\MagicUserSettingEntity;
use App\Domain\Contact\Repository\Facade\MagicUserSettingRepositoryInterface;
use App\Domain\Contact\Service\MagicUserSettingDomainService;
use App\Domain\SuperMagic\Common\Share\Constant\ResourceType;
use App\Domain\SuperMagic\Common\Share\Entity\ResourceShareEntity;
use App\Domain\SuperMagic\Common\Share\Service\ResourceShareDomainService;
use App\Domain\SuperMagic\File\Entity\AudioProjectEntity;
use App\Domain\SuperMagic\File\Entity\TaskFileEntity;
use App\Domain\SuperMagic\File\Service\AudioProjectDomainService;
use App\Domain\SuperMagic\File\Service\TaskFileDomainService;
use App\Domain\SuperMagic\Project\Entity\MicroAppEntity;
use App\Domain\SuperMagic\Project\Entity\ProjectForkEntity;
use App\Domain\SuperMagic\Project\Entity\ValueObject\ProjectMode;
use App\Domain\SuperMagic\Project\Repository\Facade\MicroAppRepositoryInterface;
use App\Domain\SuperMagic\Project\Repository\Facade\ProjectRepositoryInterface;
use App\Domain\SuperMagic\Project\Service\ProjectDomainService;
use App\Domain\SuperMagic\Project\Service\ProjectMemberDomainService;
use App\Domain\SuperMagic\Topic\Service\TopicDomainService;
use App\Domain\SuperMagic\Workspace\Entity\WorkspaceEntity;
use App\Domain\SuperMagic\Workspace\Service\WorkspaceDomainService;
use App\Infrastructure\Core\Exception\BusinessException;
use App\Infrastructure\Util\Locker\LockerInterface;
use App\Interfaces\SuperMagic\Project\DTO\Request\CreateProjectRequestDTO;
use App\Interfaces\SuperMagic\Project\DTO\Request\CreateSpecialProjectRequestDTO;
use App\Interfaces\SuperMagic\Project\DTO\Request\ForkProjectRequestDTO;
use Hyperf\Amqp\Producer;
use HyperfTest\Cases\Application\SuperMagic\Topic\Service\CreationTransactionTestCase;
use PHPUnit\Framework\Attributes\DataProvider;
use Psr\EventDispatcher\EventDispatcherInterface;
use ReflectionClass;
use RuntimeException;

/** @internal */
final class ProjectCreationTransactionTest extends CreationTransactionTestCase
{
    #[DataProvider('owners')]
    public function testEveryOwnerFinalizesAfterAllBusinessWork(string $owner, string $lastBusinessStep): void
    {
        $response = $this->service()->{$owner}($this->requestContext(), $this->request($owner));
        self::assertIsArray($response);
        $defaultIndex = array_search('default', $this->events, true);
        self::assertIsInt($defaultIndex);
        self::assertSame('commit', $this->events[$defaultIndex + 1]);
        self::assertLessThan($defaultIndex, array_search($lastBusinessStep, $this->events, true));
        self::assertSame(['identity', 'begin'], array_slice(array_values(array_filter($this->events, static fn ($event) => in_array($event, ['identity', 'begin'], true))), 0, 2));
        self::assertSame(1, count(array_keys($this->events, 'default', true)));
        self::assertNotContains('rollback', $this->events);
        self::assertSame(0, $this->transactionLevel);
        if ($owner === 'forkProject') {
            self::assertSame('publish', end($this->events));
        }
    }

    #[DataProvider('owners')]
    public function testLastBusinessFailureDoesNotChangeDefault(string $owner, string $lastBusinessStep): void
    {
        try {
            $this->service($lastBusinessStep)->{$owner}($this->requestContext(), $this->request($owner));
            self::fail('Expected injected business failure');
        } catch (BusinessException|RuntimeException $e) {
            self::assertNotSame('', $e->getMessage());
        }
        self::assertContains($lastBusinessStep, $this->events);
        self::assertSame('rollback', $this->events[count($this->events) - ($owner === 'createOrGetSpecialProject' || $owner === 'createMicroAppProject' ? 2 : 1)]);
        self::assertNotContains('default', $this->events);
        self::assertNotContains('commit', $this->events);
        self::assertNotContains('publish', $this->events);
    }

    #[DataProvider('owners')]
    public function testDefaultFailureRollsBackWithoutPublishing(string $owner, string $lastBusinessStep): void
    {
        try {
            $this->service('default')->{$owner}($this->requestContext(), $this->request($owner));
            self::fail('Expected default update failure');
        } catch (BusinessException|RuntimeException) {
            self::assertContains($lastBusinessStep, $this->events);
            self::assertContains('rollback', $this->events);
            self::assertNotContains('commit', $this->events);
            self::assertNotContains('event', $this->events);
            self::assertNotContains('publish', $this->events);
        }
    }

    public static function owners(): array
    {
        return [
            ['createProject', 'project-root'],
            ['createOrGetSpecialProject', 'setting'],
            ['forkProject', 'audio-copy'],
            ['createAgentProject', 'template-upload'],
            ['createAudioProject', 'audio-extension'],
            ['createMicroAppProject', 'micro-app-extension'],
        ];
    }

    public function testExistingSpecialProjectDoesNotPrepareConversations(): void
    {
        $response = $this->service(existingSpecialProject: true)->createOrGetSpecialProject($this->requestContext(), $this->request('createOrGetSpecialProject'));
        self::assertTrue($response['is_existing']);
        self::assertSame([], $this->events);
    }

    public function testMissingMagicClawCodeFailsBeforeIdentityCreation(): void
    {
        try {
            $this->service()->createAgentProject($this->requestContext(), $this->request('createAgentProject'), ProjectMode::MAGICLAW);
            self::fail('Expected validation failure');
        } catch (BusinessException) {
            self::assertSame([], $this->events);
        }
    }

    public function testEventFailureAfterCommitDoesNotRollBack(): void
    {
        try {
            $this->service('event')->createProject($this->requestContext(), $this->request('createProject'));
            self::fail('Expected event failure');
        } catch (BusinessException) {
            self::assertContains('commit', $this->events);
            self::assertNotContains('rollback', $this->events);
        }
    }

    private function request(string $owner): object
    {
        return match ($owner) {
            'createProject' => new CreateProjectRequestDTO(['workspace_id' => '1']),
            'createOrGetSpecialProject' => new CreateSpecialProjectRequestDTO(['key' => 'test']),
            'forkProject' => new ForkProjectRequestDTO(['source_project_id' => '5', 'target_workspace_id' => '1']),
            'createAgentProject' => new CreateAgentProjectRequestDTO(),
            'createAudioProject' => new CreateAudioProjectRequestDTO(),
            'createMicroAppProject' => new CreateMicroAppProjectRequestDTO(),
            default => throw new RuntimeException('Unknown creation owner: ' . $owner),
        };
    }

    private function service(?string $failure = null, bool $existingSpecialProject = false): ProjectAppService
    {
        if (! defined('BASE_PATH')) {
            define('BASE_PATH', dirname(__DIR__, 6));
        }
        $record = function (string $event) use ($failure): void {
            $this->events[] = $event;
            if ($event === $failure) {
                throw new RuntimeException($event . ' failed');
            }
        };
        $project = $this->project();
        $workspace = new WorkspaceEntity(['id' => 1, 'user_id' => 'user', 'user_organization_code' => 'org']);
        $workspaces = $this->createMock(WorkspaceDomainService::class);
        $workspaces->method('getWorkspaceDetail')->willReturn($workspace);
        $workspaces->method('getOrCreateWorkspaceByType')->willReturn($workspace);
        $workspaces->method('saveWorkspaceEntity')->willReturnCallback(function ($entity) use ($record) {
            $record('workspace');
            return $entity;
        });
        $projects = $this->createMock(ProjectDomainService::class);
        $projects->method('createProject')->willReturn($project);
        $projects->method('saveProjectEntity')->willReturnCallback(function ($entity) use ($record) {
            $record('project');
            return $entity;
        });
        $projects->method('forkProject')->willReturn([$project, new ProjectForkEntity(['id' => 8, 'source_project_id' => 5, 'fork_project_id' => 7])]);
        $topics = $this->createMock(TopicDomainService::class);
        $topics->method('createTopic')->willReturnCallback(function () use ($record) {
            $record('topic');
            return $this->topic();
        });
        $members = $this->createMock(ProjectMemberDomainService::class);
        $members->method('initializeProjectMemberAndSettings')->willReturnCallback(static function () use ($record): void { $record('members'); });
        $files = $this->createMock(TaskFileDomainService::class);
        foreach (['findOrCreateTopicRootDirectory' => 'topic-root', 'findOrCreateProjectRootDirectory' => 'project-root'] as $method => $event) {
            $files->method($method)->willReturnCallback(function () use ($record, $event): int {
                self::assertSame(1, $this->transactionLevel);
                self::assertNotContains('default', $this->events);
                $record($event);
                return 1;
            });
        }
        $file = new TaskFileEntity(['file_id' => 2]);
        $files->method('createProjectFile')->willReturn($file);
        $files->method('createProjectFileWithContent')->willReturnCallback(function () use ($record, $file) {
            self::assertSame(1, $this->transactionLevel);
            self::assertNotContains('default', $this->events);
            $record('template-upload');
            return $file;
        });
        $settingsRepository = $this->createMock(MagicUserSettingRepositoryInterface::class);
        $settingsLocker = $this->createMock(LockerInterface::class);
        $settingsLocker->method('mutexLock')->willReturn(true);
        $settings = new MagicUserSettingDomainService($settingsRepository, $settingsLocker);
        $settingsRepository->method('get')->willReturn($existingSpecialProject ? new MagicUserSettingEntity(['value' => ['project_id' => 7]]) : null);
        $settingsRepository->method('save')->willReturnCallback(static function ($isolation, $entity) use ($record) {
            $record('setting');
            return $entity;
        });
        $projectRepository = $this->createMock(ProjectRepositoryInterface::class);
        $projectRepository->method('findById')->willReturn($project);
        $audio = $this->createMock(AudioProjectDomainService::class);
        $audio->method('copyAudioProjectForFork')->willReturnCallback(static function () use ($record): void { $record('audio-copy'); });
        $audio->method('createAudioProject')->willReturnCallback(static function () use ($record) {
            $record('audio-extension');
            return new AudioProjectEntity(['id' => 9, 'project_id' => 7]);
        });
        $microApps = $this->createMock(MicroAppRepositoryInterface::class);
        $microApps->method('ensureByProjectId')->willReturnCallback(static function () use ($record) {
            $record('micro-app-extension');
            return new MicroAppEntity(['id' => 10]);
        });
        $shares = $this->createMock(ResourceShareDomainService::class);
        $shares->method('getShareByResourceId')->willReturn(new ResourceShareEntity(['resource_type' => ResourceType::Project->value]));
        $locker = $this->createMock(LockerInterface::class);
        $locker->method('mutexLock')->willReturn(true);
        $locker->method('spinLock')->willReturn(true);
        $locker->method('release')->willReturnCallback(static function () use ($record): bool {
            $record('release');
            return true;
        });
        $dispatcher = $this->createMock(EventDispatcherInterface::class);
        $dispatcher->method('dispatch')->willReturnCallback(function ($event) use ($record) {
            if ($this->transactionLevel === 0 && in_array('commit', $this->events, true)) {
                $record('event');
            }
            return $event;
        });
        $this->services[EventDispatcherInterface::class] = $dispatcher;
        $producer = $this->createMock(Producer::class);
        $producer->method('produce')->willReturnCallback(function () use ($record): bool {
            self::assertSame(0, $this->transactionLevel);
            $record('publish');
            return true;
        });
        $service = (new ReflectionClass(ProjectAppService::class))->newInstanceWithoutConstructor();
        $this->inject($service, ['chatAppService' => $this->chat($failure), 'workspaceDomainService' => $workspaces, 'projectDomainService' => $projects, 'topicDomainService' => $topics, 'projectMemberDomainService' => $members, 'taskFileDomainService' => $files, 'magicUserSettingDomainService' => $settings, 'projectRepository' => $projectRepository, 'audioProjectDomainService' => $audio, 'microAppRepository' => $microApps, 'resourceShareDomainService' => $shares, 'locker' => $locker, 'eventDispatcher' => $dispatcher, 'producer' => $producer]);
        return $service;
    }
}
