"""工具装饰器模块

提供工具注册装饰器，用于自动提取工具元数据并注册工具
"""

from enum import StrEnum
from typing import Callable, Optional, TypeVar


ToolClass = TypeVar("ToolClass", bound=type)


class AutoMount(StrEnum):
    """工具由运行时自动挂载的条件。"""

    ALWAYS = "always"
    CODE_EXECUTION = "code_execution"
    SKILLS = "skills"


def tool(
    name: Optional[str] = None,
    description: Optional[str] = None,
    code_mode_only: Optional[bool] = None,
    auto_mount: Optional[AutoMount] = None,
) -> Callable[[ToolClass], ToolClass]:
    """工具注册装饰器

    用于注册工具类，标记为工具并存储用户提供的元数据

    Args:
        name: 可选工具名称，若不提供则在BaseTool中自动推断
        description: 可选工具描述，若不提供则在BaseTool中自动推断
        code_mode_only: None 表示继承父类装饰器的声明，显式布尔值表示当前类覆盖
        auto_mount: 可选的运行时自动挂载条件
    """
    if code_mode_only is not None and not isinstance(code_mode_only, bool):
        raise TypeError("code_mode_only must be bool or None")
    if auto_mount is not None and not isinstance(auto_mount, AutoMount):
        raise TypeError("auto_mount must be AutoMount or None")

    def decorator(cls: ToolClass) -> ToolClass:
        if "code_mode_only" in cls.__dict__:
            raise TypeError(
                f"{cls.__name__} declares 'code_mode_only' in the class body. "
                "Use @tool(code_mode_only=True) instead."
            )
        if "auto_mount" in cls.__dict__:
            raise TypeError(
                f"{cls.__name__} declares 'auto_mount' in the class body. "
                "Use @tool(auto_mount=AutoMount.<TYPE>) instead."
            )

        inherited_code_mode_only = next(
            (
                bool(base.__dict__["_tool_code_mode_only"])
                for base in cls.__mro__[1:]
                if "_tool_code_mode_only" in base.__dict__
            ),
            False,
        )
        effective_code_mode_only = (
            inherited_code_mode_only if code_mode_only is None else code_mode_only
        )
        effective_auto_mount = auto_mount
        if effective_code_mode_only and effective_auto_mount is not None:
            raise ValueError("code_mode_only tools cannot be auto-mounted directly")

        # 标记类为工具
        cls._is_tool = True

        # 存储用户在装饰器中提供的名称和描述（如果有）
        cls._initial_name = name
        cls._initial_description = description

        # 初始化这些值，确保ToolFactory能识别
        # BaseTool.__init_subclass__会最终确定这些值
        cls._tool_name = name if name else getattr(cls, 'name', None)
        cls._tool_description = description if description else getattr(cls, 'description', None)
        cls._params_class = getattr(cls, 'params_class', None)
        cls.code_mode_only = effective_code_mode_only
        cls._tool_code_mode_only = effective_code_mode_only
        cls._tool_auto_mount = effective_auto_mount

        # 标记未注册
        cls._registered = False

        return cls
    return decorator
