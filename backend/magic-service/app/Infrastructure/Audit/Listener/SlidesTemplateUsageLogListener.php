<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\Audit\Listener;

use App\Domain\Audit\ResourceAccess\Entity\ResourceAccessLogEntity;
use App\Domain\Audit\ResourceAccess\Service\ResourceAccessLogDomainService;
use App\Domain\SlidesTemplate\Event\SlidesTemplateUsedEvent;
use Hyperf\Event\Annotation\Listener;
use Hyperf\Event\Contract\ListenerInterface;
use Psr\Container\ContainerInterface;
use Throwable;

#[Listener]
class SlidesTemplateUsageLogListener implements ListenerInterface
{
    private const string RESOURCE_TYPE = 'slides_template';

    private const string OPERATION = 'use';

    private const string SOURCE_SUPER_MAGIC_TOOL = 'super_magic_tool';

    public function __construct(
        private readonly ContainerInterface $container
    ) {
    }

    public function listen(): array
    {
        return [
            SlidesTemplateUsedEvent::class,
        ];
    }

    public function process(object $event): void
    {
        try {
            if (! $event instanceof SlidesTemplateUsedEvent) {
                return;
            }

            $this->container
                ->get(ResourceAccessLogDomainService::class)
                ->save($this->buildEntity($event));
        } catch (Throwable) {
        }
    }

    private function buildEntity(SlidesTemplateUsedEvent $event): ResourceAccessLogEntity
    {
        $template = $event->getTemplate();

        $entity = new ResourceAccessLogEntity();
        $entity->setOrganizationCode($event->getOrganizationCode())
            ->setUserId($event->getUserId())
            ->setUserName($event->getUserName())
            ->setActorType($this->resolveActorType($event->getSourceId()))
            ->setResourceType(self::RESOURCE_TYPE)
            ->setResourceCode($template->getCode())
            ->setResourceName($this->resolveResourceName($template->getLabel()))
            ->setOperation(self::OPERATION)
            ->setSource($this->resolveSource($event->getSourceId()))
            ->setRequestId($this->limitString($event->getRequestId(), 128))
            ->setContext($this->buildContext($event->getBusinessParams()));

        return $entity;
    }

    private function buildContext(array $businessParams): array
    {
        $mapping = [
            'source' => ['source'],
            'task_id' => ['task_id', 'magic_task_id'],
            'topic_id' => ['topic_id', 'magic_topic_id'],
            'project_id' => ['project_id'],
            'chat_topic_id' => ['chat_topic_id', 'magic_chat_topic_id'],
        ];

        $context = [];
        foreach ($mapping as $contextKey => $paramKeys) {
            foreach ($paramKeys as $paramKey) {
                $value = $this->limitString($businessParams[$paramKey] ?? '', 64);
                if ($value !== null) {
                    $context[$contextKey] = $value;
                    break;
                }
            }
        }

        return $context;
    }

    private function resolveActorType(string $sourceId): string
    {
        return trim($sourceId) === self::SOURCE_SUPER_MAGIC_TOOL ? 'tool' : 'user';
    }

    private function resolveSource(string $sourceId): string
    {
        $source = $this->limitString($sourceId, 64);
        return $source ?? 'api';
    }

    private function resolveResourceName(array $label): ?string
    {
        foreach (['zh_CN', 'en_US'] as $locale) {
            $name = trim((string) ($label[$locale] ?? ''));
            if ($name !== '') {
                return $this->limitString($name, 255);
            }
        }

        foreach ($label as $value) {
            $name = trim((string) $value);
            if ($name !== '') {
                return $this->limitString($name, 255);
            }
        }

        return null;
    }

    private function limitString(mixed $value, int $length): ?string
    {
        $value = trim((string) $value);
        if ($value === '') {
            return null;
        }

        return mb_substr($value, 0, $length, 'UTF-8');
    }
}
