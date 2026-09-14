import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class UUIDMixin:
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


def enum_column(python_enum: type[enum.Enum], name: str) -> Enum:
    """VARCHAR-backed enum instead of a native PostgreSQL type.

    Native pg enums turn every future status addition into an ALTER TYPE special
    case, and one type shared by two tables breaks Alembic autogenerate.
    A VARCHAR(20) column keeps migrations boring.

    `values_callable` is the part that matters and is easy to lose: without it
    SQLAlchemy stores the member *name* ("PENDING") while every migration
    default and hand-written query uses the value ("pending"), and the two only
    disagree somewhere far from here.
    """
    return Enum(
        python_enum,
        name=name,
        native_enum=False,
        length=20,
        values_callable=lambda e: [m.value for m in e],
    )
