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
use Hyperf\HttpServer\Contract\RequestInterface;
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
        $accessContext = $event->getAccessContext();
        $request = $this->getRequest();

        $entity = new ResourceAccessLogEntity();
        $entity->setOrganizationCode($event->getOrganizationCode())
            ->setUserId($event->getUserId())
            ->setUserName($event->getUserName())
            ->setActorType($this->resolveActorType($accessContext))
            ->setResourceType(self::RESOURCE_TYPE)
            ->setResourceCode($template->getCode())
            ->setResourceName($this->resolveResourceName($template->getLabel()))
            ->setOperation(self::OPERATION)
            ->setSource($this->resolveSource($accessContext))
            ->setRequestId($this->limitString($this->getHeader($request, ['x-request-id', 'request-id']), 128))
            ->setContext($accessContext);

        return $entity;
    }

    private function getRequest(): ?RequestInterface
    {
        try {
            if (! $this->container->has(RequestInterface::class)) {
                return null;
            }
            $request = $this->container->get(RequestInterface::class);
            return $request instanceof RequestInterface ? $request : null;
        } catch (Throwable) {
            return null;
        }
    }

    /**
     * @param array<string, mixed> $accessContext
     */
    private function resolveActorType(array $accessContext): string
    {
        return trim((string) ($accessContext['source'] ?? '')) === self::SOURCE_SUPER_MAGIC_TOOL ? 'tool' : 'user';
    }

    /**
     * @param array<string, mixed> $accessContext
     */
    private function resolveSource(array $accessContext): string
    {
        $source = $this->limitString($accessContext['source'] ?? null, 64);
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

    /**
     * @param string[] $headers
     */
    private function getHeader(?RequestInterface $request, array $headers): ?string
    {
        if (! $request) {
            return null;
        }

        foreach ($headers as $header) {
            $value = trim($request->getHeaderLine($header));
            if ($value !== '') {
                return $value;
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
