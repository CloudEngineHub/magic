<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\Contact\Facade\Open;

use App\Application\Chat\Service\MagicDepartmentAppService;
use App\Application\Chat\Service\MagicUserContactAppService;
use App\Domain\Contact\DTO\DepartmentQueryDTO;
use App\Domain\Contact\DTO\UserQueryDTO;
use App\Domain\Contact\Entity\MagicDepartmentEntity;
use App\Domain\Contact\Entity\ValueObject\UserQueryType;
use App\ErrorCode\ChatErrorCode;
use App\ErrorCode\PermissionErrorCode;
use App\Infrastructure\Core\AbstractApi;
use App\Infrastructure\Core\Exception\ExceptionBuilder;
use App\Infrastructure\Util\Context\RequestCoContext;
use App\Interfaces\Authorization\Web\MagicUserAuthorization;
use App\Interfaces\Chat\DTO\UserDetailDTO;
use Dtyq\ApiResponse\Annotation\ApiResponse;
use Hyperf\HttpServer\Contract\RequestInterface;

#[ApiResponse('low_code')]
class MagicContactSandboxApi extends AbstractApi
{
    public function __construct(
        RequestInterface $request,
        private readonly MagicUserContactAppService $userContactAppService,
        private readonly MagicDepartmentAppService $departmentAppService,
    ) {
        parent::__construct($request);
    }

    public function searchUsers(): array
    {
        $authorization = $this->getSearchAuthorization();
        $query = new UserQueryDTO();
        $query->setQuery($this->getSearchQuery());
        $query->setPageToken($this->getPageToken());
        $query->setQueryType(UserQueryType::User);
        $query->setFilterAgent(true);
        $query->setPageSize(20);

        $result = $this->userContactAppService->searchDepartmentUser($query, $authorization);
        $items = [];
        foreach ($result['items'] ?? [] as $user) {
            if (! $user instanceof UserDetailDTO || $user->getOrganizationCode() !== $authorization->getOrganizationCode()) {
                continue;
            }
            $items[] = [
                'user_id' => $user->getUserId(),
                'nickname' => $user->getNickname(),
                'real_name' => $user->getRealName(),
            ];
        }

        return [
            'items' => $items,
            'has_more' => (bool) ($result['has_more'] ?? false),
            'page_token' => (string) ($result['page_token'] ?? ''),
        ];
    }

    public function searchDepartments(): array
    {
        $authorization = $this->getSearchAuthorization();
        $query = new DepartmentQueryDTO();
        $query->setQuery($this->getSearchQuery());

        $result = $this->departmentAppService->searchDepartment($query, $authorization);
        $items = [];
        foreach ($result['items'] ?? [] as $department) {
            if (! $department instanceof MagicDepartmentEntity
                || $department->getOrganizationCode() !== $authorization->getOrganizationCode()) {
                continue;
            }
            $items[] = [
                'department_id' => (string) $department->getDepartmentId(),
                'name' => (string) $department->getName(),
                'parent_department_id' => (string) $department->getParentDepartmentId(),
            ];
        }

        // The existing department repository returns at most 100 matches.
        return ['items' => $items, 'coverage' => 'bounded'];
    }

    private function getSearchAuthorization(): MagicUserAuthorization
    {
        $authorization = RequestCoContext::getUserAuthorization();
        if (! $authorization instanceof MagicUserAuthorization
            || $authorization->getId() === ''
            || $authorization->getOrganizationCode() === ''
            || $authorization->getStatus() !== '1') {
            ExceptionBuilder::throw(PermissionErrorCode::AccessDenied);
        }
        return $authorization;
    }

    private function getSearchQuery(): string
    {
        $rawQuery = $this->request->input('query', '');
        if (! is_string($rawQuery)) {
            ExceptionBuilder::throw(ChatErrorCode::INPUT_PARAM_ERROR);
        }
        $query = trim($rawQuery);
        if ($query === '' || mb_strlen($query) > 100) {
            ExceptionBuilder::throw(ChatErrorCode::INPUT_PARAM_ERROR);
        }
        return $query;
    }

    private function getPageToken(): string
    {
        $pageToken = $this->request->input('page_token', '');
        if (! is_string($pageToken)
            || ($pageToken !== '' && (! ctype_digit($pageToken) || strlen($pageToken) > 6 || (int) $pageToken > 100000))) {
            ExceptionBuilder::throw(ChatErrorCode::INPUT_PARAM_ERROR);
        }
        return $pageToken;
    }
}
