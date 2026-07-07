<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Infrastructure\Audit\Listener;

use App\Domain\Audit\ResourceAccess\Entity\ResourceAccessLogEntity;
use App\Domain\Audit\ResourceAccess\Service\ResourceAccessLogDomainService;
use App\Domain\SlidesTemplate\Event\SlidesTemplateUsedEvent;
use App\Infrastructure\Util\Http\RequestHelper;
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
            ->setResourceOwnerOrganizationCode($template->getOrganizationCode())
            ->setOperation(self::OPERATION)
            ->setSource($this->resolveSource($accessContext))
            ->setSourceDetail($this->limitString($accessContext['tool_name'] ?? null, 128))
            ->setStatus('success')
            ->setIp($request ? RequestHelper::getClientIp($request) : null)
            ->setUserAgent($this->limitString($request ? RequestHelper::getUserAgent($request) : null, 512))
            ->setRequestUrl($this->limitString($request ? RequestHelper::getFullUrl($request) : null, 1024))
            ->setRequestId($this->limitString($this->getHeader($request, ['x-request-id', 'request-id']), 128))
            ->setTraceId($this->limitString($this->getHeader($request, ['x-trace-id', 'trace-id', 'traceparent']), 128))
            ->setContext($accessContext)
            ->setResourceSnapshot([
                'code' => $template->getCode(),
                'label' => $template->getLabel(),
                'source_type' => $template->getSourceType()->value,
                'category_code' => $template->getCategoryCode(),
                'owner_organization_code' => $template->getOrganizationCode(),
            ]);

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
        return trim((string) ($accessContext['tool_name'] ?? '')) === '' ? 'user' : 'tool';
    }

    /**
     * @param array<string, mixed> $accessContext
     */
    private function resolveSource(array $accessContext): string
    {
        return trim((string) ($accessContext['tool_name'] ?? '')) === '' ? 'api' : 'super_magic_tool';
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
