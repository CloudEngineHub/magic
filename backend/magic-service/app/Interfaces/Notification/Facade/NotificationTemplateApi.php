<?php

declare(strict_types=1);

namespace App\Interfaces\Notification\Facade;

use App\Application\Notification\Service\NotificationTemplateAppService;
use App\Infrastructure\Core\AbstractApi;
use Dtyq\ApiResponse\Annotation\ApiResponse;
use App\ErrorCode\GenericErrorCode;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use Hyperf\HttpServer\Contract\RequestInterface;

#[ApiResponse('low_code')]
final class NotificationTemplateApi extends AbstractApi
{
    public function __construct(
        RequestInterface $request,
        private readonly NotificationTemplateAppService $service,
    ) {
        parent::__construct($request);
    }

    /** @return array{locale:string,catalog_version:string,templates:array<string,array{title_template:string,body_template:string}>} */
    public function catalog(): array
    {
        $locale = $this->request->input('locale');
        if ($locale !== null && ! is_string($locale)) {
            ExceptionBuilder::throw(GenericErrorCode::ParameterValidationFailed, 'locale is invalid');
        }
        return $this->service->catalog($locale)->toArray();
    }
}
