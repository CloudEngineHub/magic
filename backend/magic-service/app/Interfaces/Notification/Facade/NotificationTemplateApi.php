<?php

declare(strict_types=1);

namespace App\Interfaces\Notification\Facade;

use App\Domain\Notification\Repository\Facade\NotificationTemplateRepositoryInterface;
use App\Infrastructure\Core\AbstractApi;
use Dtyq\ApiResponse\Annotation\ApiResponse;
use Hyperf\HttpServer\Contract\RequestInterface;

#[ApiResponse('low_code')]
final class NotificationTemplateApi extends AbstractApi
{
    public function __construct(
        RequestInterface $request,
        private readonly NotificationTemplateRepositoryInterface $templates
    ) {
        parent::__construct($request);
    }

    /** @return array{locale:string,templates:list<array<string,mixed>>} */
    public function catalog(): array
    {
        $locale = str_replace('_', '-', strtolower((string) $this->request->input('locale', 'zh-CN')));
        $locale = match ($locale) {
            'en-us' => 'en-US',
            default => 'zh-CN',
        };
        $items = [];
        foreach ($this->templates->listCatalog($locale) as $template) {
            $items[] = [
                'template_type' => $template->getTemplateType(),
                'version' => $template->getVersion(),
                'locale' => $template->getLocale(),
                'title_template' => $template->getTitleTemplate(),
                'body_template' => $template->getBodyTemplate(),
                'status' => $template->getStatus()->value,
            ];
        }
        return ['locale' => $locale, 'templates' => $items];
    }
}
