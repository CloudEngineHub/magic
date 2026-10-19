<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Application\Mode\Service;

use App\Application\Mode\Assembler\DefaultModelPricePreviewAssembler;
use App\Application\Mode\DTO\DefaultModelPricePreviewDTO;
use App\Interfaces\Authorization\Web\MagicUserAuthorization;

/** 编排默认文本模型售价快照，与前台用户模型解析链路隔离。 */
class DefaultModelPricePreviewService
{
    /** 复用后台 App 的默认模式快照，价格层只处理展示关系和售价。 */
    public function __construct(
        private readonly AdminModeAppService $modes,
        private readonly DefaultModelPricePreviewGraphBuilder $graphBuilder,
        private readonly DefaultModelPricePreviewAssembler $assembler,
    ) {
    }

    /** 默认配置不存在时返回空态；配置或查询故障不得伪装成免费模型。 */
    public function get(MagicUserAuthorization $authorization, string $locale): DefaultModelPricePreviewDTO
    {
        $snapshot = $this->modes->getDefaultModeModelSnapshot($authorization, true);
        if ($snapshot['mode'] === null) {
            return new DefaultModelPricePreviewDTO();
        }
        return $this->assembler->assemble($snapshot['mode'], $this->graphBuilder->build($snapshot), $locale);
    }
}
