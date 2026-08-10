<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\SuperMagic\Agent\Facade;

use App\Application\SuperMagic\Agent\Service\SuperMagicAgentMarketAppService;
use App\Interfaces\SuperMagic\Agent\Assembler\SuperMagicAgentMarketAssembler;
use App\Interfaces\SuperMagic\Agent\DTO\Request\QueryAgentMarketsRequestDTO;
use App\Interfaces\SuperMagic\Common\Support\Facade\AbstractApi;
use Dtyq\ApiResponse\Annotation\ApiResponse;
use Hyperf\Di\Annotation\Inject;
use Hyperf\HttpServer\Contract\RequestInterface;

#[ApiResponse('low_code')]
class SuperMagicAgentMarketApi extends AbstractApi
{
    #[Inject]
    protected SuperMagicAgentMarketAppService $superMagicAgentMarketAppService;

    public function __construct(
        protected RequestInterface $request,
    ) {
        parent::__construct($request);
    }

    /**
     * Return the available market categories.
     */
    public function getCategories(): array
    {
        $authorization = $this->getAuthorization();
        $includeEmpty = filter_var($this->request->input('include_empty', false), FILTER_VALIDATE_BOOLEAN);

        $result = $this->superMagicAgentMarketAppService->getCategories($authorization, $includeEmpty);
        $responseDTO = SuperMagicAgentMarketAssembler::createCategoryListItemDTOs($result);

        return ['list' => $responseDTO];
    }

    /**
     * Return the market detail for a published agent.
     */
    public function show(string $code): array
    {
        $authorization = $this->getAuthorization();
        $result = $this->superMagicAgentMarketAppService->show($authorization, $code);

        return SuperMagicAgentMarketAssembler::createAgentMarketDetailResponseDTO(
            $result['agent_market'],
            $result['agent_version']
        )->toArray();
    }

    /**
     * Query the published market list.
     */
    public function queries(): array
    {
        $authorization = $this->getAuthorization();

        $requestDTO = QueryAgentMarketsRequestDTO::fromRequest($this->request);

        $result = $this->superMagicAgentMarketAppService->queries($authorization, $requestDTO);
        $responseDTO = SuperMagicAgentMarketAssembler::createQueryAgentMarketsResponseDTO(
            $result['agent_markets'],
            $result['publisher_user_map'],
            $result['user_agents_map'],
            $result['latest_versions_map'],
            $result['playbooks_map'] ?? [],
            $requestDTO->getPage(),
            $requestDTO->getPageSize(),
            $result['total']
        );

        return $responseDTO->toArray();
    }
}
