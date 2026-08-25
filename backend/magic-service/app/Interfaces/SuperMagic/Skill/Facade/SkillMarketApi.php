<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SuperMagic\Skill\Facade;

use App\Application\SuperMagic\Skill\Service\SkillMarketAppService;
use App\Domain\SuperMagic\Skill\Entity\ValueObject\Query\SkillQuery;
use App\Infrastructure\Util\Context\RequestContext;
use App\Interfaces\SuperMagic\Common\Support\Facade\AbstractApi;
use App\Interfaces\SuperMagic\Skill\Assembler\SkillAssembler;
use App\Interfaces\SuperMagic\Skill\FormRequest\SkillQueryFormRequest;
use Dtyq\ApiResponse\Annotation\ApiResponse;
use Hyperf\HttpServer\Contract\RequestInterface;

#[ApiResponse('low_code')]
class SkillMarketApi extends AbstractApi
{
    public function __construct(
        protected RequestInterface $request,
        protected SkillMarketAppService $skillMarketAppService,
    ) {
        parent::__construct($request);
    }

    /**
     * 获取市场技能库列表.
     *
     * @param RequestContext $requestContext 请求上下文
     */
    public function queries(RequestContext $requestContext, SkillQueryFormRequest $request)
    {
        // 设置用户授权信息
        $requestContext->setUserAuthorization($this->getAuthorization());

        $requestData = $request->validated();
        $query = new SkillQuery($requestData);
        $page = $this->createPage();

        $result = $this->skillMarketAppService->queries($requestContext, $query, $page);

        return SkillAssembler::createMarketListResponseDTO(
            $result['list'],
            $result['userSkills'],
            $result['publisherUserMap'],
            $this->getAuthorization()->getId(),
            $page->getPage(),
            $page->getPageNum(),
            $result['total'],
            $result['skillVersionMap'] ?? []
        );
    }

    /**
     * 获取市场技能详情.
     */
    public function show(RequestContext $requestContext, string $code)
    {
        $requestContext->setUserAuthorization($this->getAuthorization());

        $result = $this->skillMarketAppService->show($requestContext, $code);

        return SkillAssembler::createMarketDetailResponseDTO(
            $result['skillMarket'],
            $result['skillVersion'],
            $result['isAdded'],
            $result['isCreator'],
            $result['publisherUser'],
            $result['skillFileUrl']
        );
    }
}
