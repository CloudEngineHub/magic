<?php

declare(strict_types=1);
/**
 * Copyright (c) The Magic , Distributed under the software license
 */

namespace App\Interfaces\Admin\Request\AppMenu;

use App\Domain\AppMenu\Entity\ValueObject\AppMenuIconType;
use App\Domain\AppMenu\Entity\ValueObject\AppMenuStatus;
use App\Domain\AppMenu\Entity\ValueObject\DisplayScope;
use App\Domain\AppMenu\Entity\ValueObject\OpenMethod;
use App\Domain\Permission\Entity\ValueObject\ResourceVisibility\VisibilityType;
use Hyperf\Validation\Request\FormRequest;
use Hyperf\Validation\Rule;

class AppMenuSaveRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, mixed>|string>
     */
    public function rules(): array
    {
        $isOverrideOnly = $this->isOverrideOnly();

        return [
            'id' => [$isOverrideOnly ? 'required' : 'sometimes', 'string'],
            'override_only' => 'sometimes|boolean',
            'name_i18n' => [Rule::requiredIf(fn (): bool => ! $isOverrideOnly), 'array'],
            'icon' => [
                'nullable',
                'string',
                'max:255',
                Rule::requiredIf(fn (): bool => ! $this->isOverrideOnly() && $this->getRequestedIconType() === AppMenuIconType::Icon),
            ],
            'icon_url' => [
                'nullable',
                'string',
                'max:2048',
                Rule::requiredIf(fn (): bool => ! $this->isOverrideOnly() && $this->getRequestedIconType() === AppMenuIconType::Image),
            ],
            'icon_type' => [
                Rule::requiredIf(fn (): bool => ! $this->isOverrideOnly()),
                'integer',
                Rule::in(AppMenuIconType::getValues()),
            ],
            'path' => [Rule::requiredIf(fn (): bool => ! $this->isOverrideOnly()), 'string', 'max:255'],
            'open_method' => [Rule::requiredIf(fn (): bool => ! $this->isOverrideOnly()), 'integer', Rule::in(OpenMethod::getValues())],
            'sort_order' => 'sometimes|integer|min:0',
            'display_scope' => [Rule::requiredIf(fn (): bool => ! $this->isOverrideOnly()), 'integer', Rule::in(DisplayScope::getValues())],
            'status' => ['sometimes', 'integer', Rule::in(AppMenuStatus::getValues())],
            'visibility_config' => 'sometimes|array',
            'visibility_config.visibility_type' => ['sometimes', 'integer', Rule::in(array_column(VisibilityType::cases(), 'value'))],
            'visibility_config.users' => 'sometimes|array',
            'visibility_config.users.*.id' => 'required_with:visibility_config.users|string|max:64',
            'visibility_config.departments' => 'sometimes|array',
            'visibility_config.departments.*.id' => 'required_with:visibility_config.departments|string|max:64',
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'id.string' => '应用ID必须是字符串',
            'name_i18n.required' => '应用名称（多语言）不能为空',
            'name_i18n.array' => '应用名称（多语言）必须是对象',
            'icon.required' => '图标不能为空',
            'icon.string' => '图标必须是字符串',
            'icon.max' => '图标最大长度为255个字符',
            'icon_url.required' => '图标图片不能为空',
            'icon_url.string' => '图标图片必须是字符串',
            'icon_url.max' => '图标图片最大长度为2048个字符',
            'icon_type.required' => '图标类型不能为空',
            'icon_type.integer' => '图标类型必须是整数',
            'icon_type.in' => '图标类型不合法',
            'path.required' => '应用路径不能为空',
            'path.string' => '应用路径必须是字符串',
            'path.max' => '应用路径最大长度为255个字符',
            'open_method.required' => '打开方式不能为空',
            'open_method.integer' => '打开方式必须是整数',
            'open_method.in' => '打开方式不合法',
            'sort_order.integer' => '排序必须是整数',
            'sort_order.min' => '排序不能小于0',
            'display_scope.required' => '可见范围不能为空',
            'display_scope.integer' => '可见范围必须是整数',
            'display_scope.in' => '可见范围不合法',
            'status.integer' => '状态必须是整数',
            'status.in' => '状态不合法',
            'visibility_config.array' => '可见范围必须是对象',
            'visibility_config.visibility_type.integer' => '可见范围类型必须是整数',
            'visibility_config.visibility_type.in' => '可见范围类型不合法',
        ];
    }

    /**
     * @return array<string, string>
     */
    public function attributes(): array
    {
        return [
            'id' => '应用ID',
            'name_i18n' => '应用名称（多语言）',
            'icon' => '图标',
            'icon_url' => '图标图片',
            'icon_type' => '图标类型',
            'path' => '应用路径',
            'open_method' => '打开方式',
            'sort_order' => '排序',
            'display_scope' => '可见范围',
            'status' => '状态',
            'visibility_config' => '可见范围',
            'visibility_config.visibility_type' => '可见范围类型',
        ];
    }

    private function getRequestedIconType(): ?AppMenuIconType
    {
        $iconType = $this->input('icon_type');
        if ($iconType === null || $iconType === '') {
            return null;
        }

        return AppMenuIconType::tryFrom((int) $iconType);
    }

    private function isOverrideOnly(): bool
    {
        return filter_var($this->input('override_only', false), FILTER_VALIDATE_BOOLEAN);
    }
}
