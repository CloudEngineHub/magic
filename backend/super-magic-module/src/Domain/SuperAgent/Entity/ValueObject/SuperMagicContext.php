<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace Dtyq\SuperMagic\Domain\SuperAgent\Entity\ValueObject;

use Dtyq\SuperMagic\Domain\SuperAgent\Entity\ProjectEntity;
use Dtyq\SuperMagic\Domain\SuperAgent\Entity\TopicEntity;
use Dtyq\SuperMagic\Domain\SuperAgent\Entity\WorkspaceEntity;

/**
 * Super Magic 产品上下文。
 *
 * ID 在跨服务序列化时统一输出为字符串，避免雪花 ID 在其它运行时中发生精度损失。
 */
final readonly class SuperMagicContext
{
    public function __construct(
        private ?SuperMagicWorkspaceContext $workspace,
        private SuperMagicProjectContext $project,
        private SuperMagicTopicContext $topic,
        private SuperMagicSandboxContext $sandbox,
    ) {
    }

    public static function fromEntities(
        ProjectEntity $projectEntity,
        TopicEntity $topicEntity,
        ?WorkspaceEntity $workspaceEntity,
        string $sandboxId,
    ): self {
        return new self(
            workspace: $workspaceEntity === null
                ? null
                : new SuperMagicWorkspaceContext(
                    id: (string) $workspaceEntity->getId(),
                    name: $workspaceEntity->getName(),
                ),
            project: new SuperMagicProjectContext(
                id: (string) $projectEntity->getId(),
                name: $projectEntity->getProjectName(),
            ),
            topic: new SuperMagicTopicContext(
                id: (string) $topicEntity->getId(),
                name: $topicEntity->getTopicName(),
            ),
            sandbox: new SuperMagicSandboxContext(id: $sandboxId),
        );
    }

    public function withSandboxId(string $sandboxId): self
    {
        return new self(
            workspace: $this->workspace,
            project: $this->project,
            topic: $this->topic,
            sandbox: new SuperMagicSandboxContext(id: $sandboxId),
        );
    }

    public function getWorkspace(): ?SuperMagicWorkspaceContext
    {
        return $this->workspace;
    }

    public function getProject(): SuperMagicProjectContext
    {
        return $this->project;
    }

    public function getTopic(): SuperMagicTopicContext
    {
        return $this->topic;
    }

    public function getSandbox(): SuperMagicSandboxContext
    {
        return $this->sandbox;
    }

    /**
     * @return array{
     *     workspace: null|array{id: string, name: string},
     *     project: array{id: string, name: string},
     *     topic: array{id: string, name: string},
     *     sandbox: array{id: string}
     * }
     */
    public function toArray(): array
    {
        return [
            'workspace' => $this->workspace?->toArray(),
            'project' => $this->project->toArray(),
            'topic' => $this->topic->toArray(),
            'sandbox' => $this->sandbox->toArray(),
        ];
    }
}
