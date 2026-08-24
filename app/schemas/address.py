import uuid

from pydantic import BaseModel, ConfigDict, Field


class AddressBase(BaseModel):
    label: str = Field(default="Home", max_length=50)
    recipient_name: str = Field(max_length=120)
    phone: str = Field(max_length=20)
    line1: str = Field(max_length=255)
    line2: str | None = Field(default=None, max_length=255)
    city: str = Field(max_length=80)
    district: str | None = Field(default=None, max_length=80)
    postal_code: str | None = Field(default=None, max_length=20)
    country: str = Field(default="Bangladesh", max_length=60)
    is_default: bool = False


class AddressCreate(AddressBase):
    pass


class AddressUpdate(BaseModel):
    label: str | None = None
    recipient_name: str | None = None
    phone: str | None = None
    line1: str | None = None
    line2: str | None = None
    city: str | None = None
    district: str | None = None
    postal_code: str | None = None
    country: str | None = None
    is_default: bool | None = None


class AddressOut(AddressBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
