<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\Audit\Facade;

use App\Application\Audit\ModelCall\Service\AuditService as ModelAuditService;
use App\Application\Audit\Service\AdminOperationLogAppService;
use App\Application\Kernel\Enum\MagicOperationEnum;
use App\Application\Kernel\Enum\MagicResourceEnum;
use App\Domain\Provider\Entity\ValueObject\ProviderVirtualIdentity;
use App\ErrorCode\GenericErrorCode;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use App\Infrastructure\Util\OfficialOrganizationUtil;
use App\Infrastructure\Util\Permission\Annotation\CheckPermission;
use App\Interfaces\Audit\Assembler\AdminOperationLogAssembler;
use App\Interfaces\Audit\DTO\AdminOperationLogListRequestDTO;
use App\Interfaces\Kernel\DTO\PageDTO;
use App\Interfaces\Permission\Facade\AbstractPermissionApi;
use DateTimeImmutable;
use DateTimeZone;
use Dtyq\ApiResponse\Annotation\ApiResponse;
use Hyperf\Di\Annotation\Inject;

/**
 * 管理员操作日志 API.
 * 需具备操作日志-查询权限（由 Facade 层 CheckPermission 注解校验）.
 */
#[ApiResponse(version: 'low_code')]
class AdminOperationLogApi extends AbstractPermissionApi
{
    /** 默认查询天数：今天往前推 29 天的 00:00:00，与今天共 30 个自然日 */
    private const int MODEL_AUDIT_DEFAULT_RANGE_DAYS = 30;

    #[Inject]
    protected AdminOperationLogAppService $appService;

    #[Inject]
    protected ModelAuditService $modelAuditService;

    /**
     * 查询操作日志列表.
     */
    #[CheckPermission(MagicResourceEnum::SAFE_OPERATION_LOG, MagicOperationEnum::QUERY)]
    public function queries(): array
    {
        $authorization = $this->getAuthorization();
        $requestDTO = AdminOperationLogListRequestDTO::fromRequest($this->request);
        $result = $this->appService->queriesByAuthorization(
            $authorization,
            $requestDTO->page,
            $requestDTO->pageSize,
            $requestDTO->toFilters()
        );
        $dtoList = AdminOperationLogAssembler::toDTOList($result['list']);

        return (new PageDTO($result['page'], $result['total'], $dtoList))->toArray();
    }

    /**
     * 获取操作日志详情.
     */
    #[CheckPermission(MagicResourceEnum::SAFE_OPERATION_LOG, MagicOperationEnum::QUERY)]
    public function show(int $id): array
    {
        $entity = $this->appService->getByIdByAuthorization($this->getAuthorization(), $id);
        if (! $entity) {
            return [];
        }

        return AdminOperationLogAssembler::toDTO($entity)->toArray();
    }

    /**
     * 模型调用审计列表（游标分页，展示接口）.
     * 需 workspace 或 platform 模型调用审计查询权限（择一）.
     */
    #[CheckPermission(
        [MagicResourceEnum::WORKSPACE_AI_MODEL_AUDIT_LOG, MagicResourceEnum::PLATFORM_AI_MODEL_AUDIT_LOG],
        MagicOperationEnum::QUERY
    )]
    public function listModelAudit(): array
    {
        $authorization = $this->getAuthorization();
        $currentOrganizationCode = (string) $authorization->getOrganizationCode();
        $isOfficialOrganization = OfficialOrganizationUtil::isOfficialOrganization($currentOrganizationCode);

        $filters = [];
        $type = (string) $this->request->input('type', '');
        $status = (string) $this->request->input('status', '');
        $productCode = (string) $this->request->input('product_code', '');
        $modelVersion = trim((string) $this->request->input('model_version', ''));
        $providerName = trim((string) $this->request->input('provider_name', ''));
        $serviceProviderConfigId = trim((string) $this->request->input('service_provider_config_id', ''));
        $userId = (string) $this->request->input('user_id', '');
        $accessScope = trim((string) $this->request->input('access_scope', ''));
        $magicTopicId = trim((string) $this->request->input('magic_topic_id', ''));
        $requestId = trim((string) $this->request->input('request_id', ''));
        $eventId = trim((string) $this->request->input('event_id', ''));
        $organizationCode = trim((string) $this->request->input('organization_code', ''));
        $startDate = (string) $this->request->input('start_date', '');
        $endDate = (string) $this->request->input('end_date', '');

        $cursorId = $this->request->input('cursor_id');
        $cursorId = is_string($cursorId) && $cursorId !== '' ? $cursorId : null;
        $direction = (string) $this->request->input('direction', 'next');
        if (! in_array($direction, ['next', 'prev'], true)) {
            $direction = 'next';
        }

        if ($type !== '') {
            $filters['type'] = $type;
        }
        if ($status !== '') {
            $filters['status'] = $status;
        }
        if ($productCode !== '') {
            $filters['product_code'] = $productCode;
        }
        if ($modelVersion !== '') {
            $filters['model_version'] = $modelVersion;
        }
        if ($providerName !== '') {
            $filters['provider_name'] = $providerName;
        }
        if ($serviceProviderConfigId !== ''
            && ! ProviderVirtualIdentity::isPlatformOfficialId($serviceProviderConfigId)
        ) {
            $filters['service_provider_config_id'] = $serviceProviderConfigId;
        }
        if ($userId !== '') {
            $filters['user_id'] = $userId;
        }
        if ($accessScope !== '') {
            $filters['access_scope'] = $accessScope;
        }
        if ($magicTopicId !== '') {
            $filters['magic_topic_id'] = $magicTopicId;
        }
        if ($requestId !== '') {
            $filters['request_id'] = $requestId;
        }
        if ($eventId !== '') {
            $filters['event_id'] = $eventId;
        }
        if ($isOfficialOrganization && $organizationCode !== '') {
            $filters['organization_code'] = $organizationCode;
        }
        $startDateMs = $this->parseListDateToMs($startDate, '00:00:00');
        $endDateMs = $this->parseListDateToMs($endDate, '23:59:59');
        if ($startDateMs !== null) {
            $filters['start_operation_time'] = $startDateMs;
        }
        if ($endDateMs !== null) {
            $filters['end_operation_time'] = $endDateMs;
        }

        if ($startDateMs === null && $endDateMs === null) {
            $filters['start_operation_time'] = $this->defaultStartOperationTimeMs();
            $filters['end_operation_time'] = $this->defaultEndOperationTimeMs();
        }

        return $this->modelAuditService->listForAdmin(
            (int) $this->request->input('page_size', 20),
            $filters,
            $currentOrganizationCode,
            $isOfficialOrganization,
            $cursorId,
            $direction
        );
    }

    #[CheckPermission(
        [MagicResourceEnum::WORKSPACE_AI_MODEL_AUDIT_STATISTICS, MagicResourceEnum::PLATFORM_AI_MODEL_AUDIT_STATISTICS],
        MagicOperationEnum::QUERY
    )]
    public function modelAuditStatistics(): array
    {
        $authorization = $this->getAuthorization();
        $currentOrganizationCode = (string) $authorization->getOrganizationCode();
        $isOfficialOrganization = OfficialOrganizationUtil::isOfficialOrganization($currentOrganizationCode);

        $startDate = trim((string) $this->request->input('start_date', ''));
        $endDate = trim((string) $this->request->input('end_date', ''));
        $serviceProviderConfigId = trim((string) $this->request->input('service_provider_config_id', ''));
        $productCode = trim((string) $this->request->input('product_code', ''));
        $accessScope = trim((string) $this->request->input('access_scope', ''));
        $organizationCode = trim((string) $this->request->input('organization_code', ''));

        if (($startDate === '') !== ($endDate === '')) {
            ExceptionBuilder::throw(
                GenericErrorCode::ParameterValidationFailed,
                'start_date and end_date must be provided together'
            );
        }

        if ($startDate === '' && $endDate === '') {
            $tz = new DateTimeZone((string) config('app.default_timezone', 'Asia/Shanghai'));
            $startMs = (new DateTimeImmutable('today', $tz))->setTime(0, 0, 0)->getTimestamp() * 1000;
            $endMs = (new DateTimeImmutable('tomorrow', $tz))->setTime(0, 0, 0)->getTimestamp() * 1000;
        } else {
            [$startMs, $endMs] = $this->parseStatisticsRange($startDate, $endDate);
        }

        $filters = [
            'start_operation_time' => $startMs,
            'end_operation_time' => $endMs,
        ];

        if ($serviceProviderConfigId !== '') {
            $filters['service_provider_config_id'] = $serviceProviderConfigId;
        }
        if ($productCode !== '') {
            $filters['product_code'] = $productCode;
        }
        if ($accessScope !== '') {
            $filters['access_scope'] = $accessScope;
        }
        if ($organizationCode !== '') {
            $filters['organization_code'] = $organizationCode;
        }

        return $this->modelAuditService->statistics(
            $filters,
            $currentOrganizationCode,
            $isOfficialOrganization
        );
    }

    /** @return array{0: int, 1: int} */
    private function parseStatisticsRange(string $startDate, string $endDate): array
    {
        $timezone = new DateTimeZone((string) config('app.default_timezone', 'Asia/Shanghai'));
        $isDateRange = preg_match('/^\d{4}-\d{2}-\d{2}$/', $startDate) === 1
            && preg_match('/^\d{4}-\d{2}-\d{2}$/', $endDate) === 1;
        $isHourRange = preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:00:00$/', $startDate) === 1
            && preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:00:00$/', $endDate) === 1;
        if (! $isDateRange && ! $isHourRange) {
            ExceptionBuilder::throw(
                GenericErrorCode::ParameterValidationFailed,
                'start_date and end_date must both be natural dates or whole hours'
            );
        }

        $format = $isDateRange ? '!Y-m-d' : '!Y-m-d H:i:s';
        $start = DateTimeImmutable::createFromFormat($format, $startDate, $timezone);
        $startErrors = DateTimeImmutable::getLastErrors();
        $end = DateTimeImmutable::createFromFormat($format, $endDate, $timezone);
        $endErrors = DateTimeImmutable::getLastErrors();
        if (! $start || ! $end
            || ($startErrors !== false && ($startErrors['warning_count'] > 0 || $startErrors['error_count'] > 0))
            || ($endErrors !== false && ($endErrors['warning_count'] > 0 || $endErrors['error_count'] > 0))
            || $start->format($isDateRange ? 'Y-m-d' : 'Y-m-d H:i:s') !== $startDate
            || $end->format($isDateRange ? 'Y-m-d' : 'Y-m-d H:i:s') !== $endDate
            || $start > $end
        ) {
            ExceptionBuilder::throw(GenericErrorCode::ParameterValidationFailed, 'invalid statistics time range');
        }

        $exclusiveEnd = $end->modify($isDateRange ? '+1 day' : '+1 hour');
        $tomorrowStart = new DateTimeImmutable('tomorrow', $timezone);
        if ($exclusiveEnd > $tomorrowStart) {
            ExceptionBuilder::throw(
                GenericErrorCode::ParameterValidationFailed,
                'end_date cannot be later than today'
            );
        }
        return [$start->getTimestamp() * 1000, $exclusiveEnd->getTimestamp() * 1000];
    }

    private function parseListDateToMs(string $date, string $defaultTime): ?int
    {
        if ($date === '') {
            return null;
        }

        $timezone = new DateTimeZone((string) config('app.default_timezone', 'Asia/Shanghai'));
        $value = strlen($date) === 10 ? $date . ' ' . $defaultTime : $date;
        $dateTime = DateTimeImmutable::createFromFormat('!Y-m-d H:i:s', $value, $timezone);
        $errors = DateTimeImmutable::getLastErrors();
        if (! $dateTime
            || ($errors !== false && ($errors['warning_count'] > 0 || $errors['error_count'] > 0))
            || $dateTime->format('Y-m-d H:i:s') !== $value
        ) {
            return null;
        }

        return $dateTime->getTimestamp() * 1000;
    }

    /** 默认结束时间：今天 23:59:59.999（毫秒） */
    private function defaultEndOperationTimeMs(): int
    {
        $tz = new DateTimeZone(config('app.default_timezone', 'Asia/Shanghai'));
        return (new DateTimeImmutable('today', $tz))->setTime(23, 59, 59)->getTimestamp() * 1000 + 999;
    }

    /** 默认开始时间：今天往前推 (DEFAULT_RANGE_DAYS - 1) 天的 00:00:00（毫秒），与今天共 30 个自然日 */
    private function defaultStartOperationTimeMs(): int
    {
        $tz = new DateTimeZone(config('app.default_timezone', 'Asia/Shanghai'));
        return (new DateTimeImmutable('today', $tz))
            ->modify('-' . (self::MODEL_AUDIT_DEFAULT_RANGE_DAYS - 1) . ' days')
            ->setTime(0, 0, 0)
            ->getTimestamp() * 1000;
    }
}
