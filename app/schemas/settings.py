from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.settings import AdvanceMode


class SettingsBase(BaseModel):
    site_title: str = Field(max_length=120)
    tagline: str | None = Field(default=None, max_length=200)
    currency_code: str = Field(min_length=3, max_length=3)
    currency_symbol: str = Field(min_length=1, max_length=8)
    delivery_charge: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    free_delivery_threshold: Decimal | None = Field(default=None, gt=0)
    advance_mode: AdvanceMode = AdvanceMode.NONE
    advance_amount: Decimal = Field(default=Decimal("0.00"), ge=0)


class SettingsOut(SettingsBase):
    model_config = ConfigDict(from_attributes=True)

    logo_url: str | None = None
    favicon_url: str | None = None


class SettingsUpdate(BaseModel):
    """Every field optional — the panel PATCHes whichever card was saved.

    Branding is not here: a logo arrives as a file on its own endpoint, and
    letting the URL be set as free text would point the shop's own header at
    an arbitrary host.
    """

    site_title: str | None = Field(default=None, min_length=1, max_length=120)
    tagline: str | None = Field(default=None, max_length=200)
    currency_code: str | None = Field(default=None, min_length=3, max_length=3)
    currency_symbol: str | None = Field(default=None, min_length=1, max_length=8)
    delivery_charge: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    free_delivery_threshold: Decimal | None = Field(default=None, gt=0)
    # Distinct from "not supplied": the panel sends this to mean "never free".
    clear_free_delivery_threshold: bool = False
    advance_mode: AdvanceMode | None = None
    advance_amount: Decimal | None = Field(default=None, ge=0)

    @field_validator("currency_code")
    @classmethod
    def _upper(cls, value: str | None) -> str | None:
        return value.upper() if value else value

    @model_validator(mode="after")
    def _threshold_not_both_ways(self) -> "SettingsUpdate":
        if self.clear_free_delivery_threshold and self.free_delivery_threshold is not None:
            raise ValueError(
                "Pass either free_delivery_threshold or clear_free_delivery_threshold, not both"
            )
        return self
