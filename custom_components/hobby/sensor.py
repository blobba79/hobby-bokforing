"""Sensor platform for Hobby integration."""
from __future__ import annotations

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    store = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([HobbySensor(store, entry)])


class HobbySensor(SensorEntity):
    _attr_has_state = True
    _attr_native_unit_of_measurement = "kr"
    _attr_icon = "mdi:label-outline"

    def __init__(self, store, entry: ConfigEntry) -> None:
        self._store = store
        self._attr_unique_id = f"hobby_{entry.entry_id}"
        self._attr_name = entry.data.get("name", "Hobby")
        store.sensor = self

    @property
    def native_value(self) -> float:
        return self._store.total_income

    @property
    def extra_state_attributes(self) -> dict:
        mi, mu = self._store.monthly
        return {
            "intakter": self._store.data.get("intakter", []),
            "utgifter": self._store.data.get("utgifter", []),
            "kategorier": sorted(self._store.settings.get("kategorier", [])),
            "butiker": sorted(self._store.settings.get("butiker", [])),
            "bukettyper": sorted(self._store.settings.get("bukettyper", [])),
            "total_intakter": self._store.total_income,
            "total_utgifter": self._store.total_expense,
            "resultat": round(self._store.total_income - self._store.total_expense, 2),
            "utgifter_per_kategori": self._store.by_category,
            "utgifter_per_butik": self._store.by_store,
            "manadsdata_intakter": mi,
            "manadsdata_utgifter": mu,
        }

    @callback
    def _handle_coordinator_update(self) -> None:
        self.async_write_ha_state()
