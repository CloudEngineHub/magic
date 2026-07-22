"""Common base class for application services."""
from typing import Optional


class Base:
    """Base service class without automatic function tracing."""

    # Default service type (can be overridden in subclasses)
    SERVICE_TYPE: Optional[str] = None

    def __init_subclass__(cls, **kwargs):
        """Set a default service type for subclasses."""
        super().__init_subclass__(**kwargs)

        if not hasattr(cls, "SERVICE_TYPE") or cls.SERVICE_TYPE is None:
            cls.SERVICE_TYPE = cls.__name__.replace("Service", "").lower()
