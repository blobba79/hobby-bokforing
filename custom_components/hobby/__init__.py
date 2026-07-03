"""Hobby integration – bokföring för hobbyverksamheter."""
from __future__ import annotations

import json
import logging
import uuid
from pathlib import Path

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall

from .const import CONF_DATA_DIR, DOMAIN

_LOGGER = logging.getLogger(__name__)

PLATFORMS = ["sensor"]

MONTHS = ["Jan", "Feb", "Mar", "Apr", "Maj", "Jun",
          "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"]

DEFAULT_DATA = {
    "intakter": [],
    "utgifter": [],
}

DEFAULT_SETTINGS = {
    "kategorier": [],
    "butiker": [],
    "bukettyper": [],
}


class HobbyStore:
    """Handles persistence and business logic for one hobby."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self.hass = hass
        self.entry = entry
        self.data_dir = Path(entry.data[CONF_DATA_DIR])
        self._data_file = self.data_dir / "data.json"
        self._settings_file = self.data_dir / "settings.json"
        self.data: dict = dict(DEFAULT_DATA)
        self.settings: dict = dict(DEFAULT_SETTINGS)
        self.sensor = None

    # ---------- persistence ----------

    async def async_load(self) -> None:
        self.data = await self._load_file(self._data_file, DEFAULT_DATA)
        self.settings = await self._load_file(self._settings_file, DEFAULT_SETTINGS)

    async def _load_file(self, path: Path, default: dict) -> dict:
        try:
            if path.exists():
                return json.loads(await self.hass.async_add_executor_job(path.read_text))
        except Exception:
            _LOGGER.warning("Kunde inte läsa %s, använder standardvärden", path)
        return dict(default)

    async def async_save(self) -> None:
        await self._save_file(self._data_file, self.data)
        await self._save_file(self._settings_file, self.settings)
        if self.sensor is not None:
            self.sensor.async_write_ha_state()

    async def _save_file(self, path: Path, content: dict) -> None:
        try:
            await self.hass.async_add_executor_job(self.data_dir.mkdir, True)
            await self.hass.async_add_executor_job(
                path.write_text,
                json.dumps(content, ensure_ascii=False, indent=2),
            )
        except Exception:
            _LOGGER.error("Kunde inte spara till %s", path)

    # ---------- computed ----------

    @property
    def total_income(self) -> float:
        return round(sum(r.get("totalt", 0) for r in self.data.get("intakter", [])), 2)

    @property
    def total_expense(self) -> float:
        return round(sum(r.get("belopp", 0) for r in self.data.get("utgifter", [])), 2)

    @property
    def by_category(self) -> dict:
        out: dict = {}
        for r in self.data.get("utgifter", []):
            k = r.get("kategori", "?")
            out[k] = round(out.get(k, 0) + r.get("belopp", 0), 2)
        return out

    @property
    def by_store(self) -> dict:
        out: dict = {}
        for r in self.data.get("utgifter", []):
            k = r.get("butik", "?")
            out[k] = round(out.get(k, 0) + r.get("belopp", 0), 2)
        return out

    @property
    def monthly(self) -> tuple[dict, dict]:
        mi = {m: 0 for m in MONTHS}
        mu = {m: 0 for m in MONTHS}
        for r in self.data.get("intakter", []):
            d = r.get("datum", "")
            if d and len(d) >= 7:
                mi[MONTHS[int(d[5:7]) - 1]] += r.get("totalt", 0)
        for r in self.data.get("utgifter", []):
            d = r.get("datum", "")
            if d and len(d) >= 7:
                mu[MONTHS[int(d[5:7]) - 1]] += r.get("belopp", 0)
        return mi, mu

    # ---------- mutations ----------

    async def add_income(self, datum, bukettyp, antal, pris):
        antal = float(antal or 0)
        pris = float(pris or 0)
        self.data.setdefault("intakter", []).append({
            "id": uuid.uuid4().hex[:8],
            "datum": datum,
            "bukettyp": bukettyp,
            "antal": antal,
            "pris": pris,
            "totalt": round(antal * pris, 2),
        })
        await self.async_save()

    async def edit_income(self, id, datum, bukettyp, antal, pris):
        for r in self.data.get("intakter", []):
            if r["id"] == id:
                antal = float(antal or 0)
                pris = float(pris or 0)
                r.update({
                    "datum": datum,
                    "bukettyp": bukettyp,
                    "antal": antal,
                    "pris": pris,
                    "totalt": round(antal * pris, 2),
                })
                break
        await self.async_save()

    async def delete_income(self, id):
        self.data["intakter"] = [
            r for r in self.data.get("intakter", []) if r["id"] != id
        ]
        await self.async_save()

    async def add_expense(self, datum, kategori, butik, belopp):
        self.data.setdefault("utgifter", []).append({
            "id": uuid.uuid4().hex[:8],
            "datum": datum,
            "kategori": kategori,
            "butik": butik,
            "belopp": float(belopp or 0),
        })
        await self.async_save()

    async def edit_expense(self, id, datum, kategori, butik, belopp):
        for r in self.data.get("utgifter", []):
            if r["id"] == id:
                r.update({
                    "datum": datum,
                    "kategori": kategori,
                    "butik": butik,
                    "belopp": float(belopp or 0),
                })
                break
        await self.async_save()

    async def delete_expense(self, id):
        self.data["utgifter"] = [
            r for r in self.data.get("utgifter", []) if r["id"] != id
        ]
        await self.async_save()

    async def add_option(self, listtyp, varde):
        lst = self.settings.setdefault(listtyp, [])
        if varde and varde not in lst:
            lst.append(varde)
            lst.sort()
        await self.async_save()

    async def remove_option(self, listtyp, varde):
        lst = self.settings.setdefault(listtyp, [])
        if varde in lst:
            lst.remove(varde)
        await self.async_save()

    async def import_data(self, intakter=None, utgifter=None, kategorier=None,
                           butiker=None, bukettyper=None):
        if intakter is not None:
            self.data["intakter"] = intakter
        if utgifter is not None:
            self.data["utgifter"] = utgifter
        if kategorier is not None:
            self.settings["kategorier"] = sorted(set(kategorier))
        if butiker is not None:
            self.settings["butiker"] = sorted(set(butiker))
        if bukettyper is not None:
            self.settings["bukettyper"] = sorted(set(bukettyper))
        await self.async_save()


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    # Symlink hobby-card.js from www/ to this integration directory
    card_source = Path(__file__).parent / "hobby-card.js"
    card_dest = Path(hass.config.config_dir) / "www" / "hobby-card.js"
    if card_source.exists():
        try:
            card_dest.parent.mkdir(parents=True, exist_ok=True)
            if card_dest.exists():
                card_dest.unlink()
            card_dest.symlink_to(card_source)
        except Exception as exc:
            _LOGGER.warning("Kunde inte skapa symlink för hobby-card.js: %s", exc)

    store = HobbyStore(hass, entry)
    await store.async_load()
    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = store

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    async def _add_income(call: ServiceCall):
        await store.add_income(
            call.data.get("datum"), call.data.get("bukettyp"),
            call.data.get("antal"), call.data.get("pris"),
        )

    async def _edit_income(call: ServiceCall):
        await store.edit_income(
            call.data.get("id"), call.data.get("datum"),
            call.data.get("bukettyp"), call.data.get("antal"),
            call.data.get("pris"),
        )

    async def _delete_income(call: ServiceCall):
        await store.delete_income(call.data.get("id"))

    async def _add_expense(call: ServiceCall):
        await store.add_expense(
            call.data.get("datum"), call.data.get("kategori"),
            call.data.get("butik"), call.data.get("belopp"),
        )

    async def _edit_expense(call: ServiceCall):
        await store.edit_expense(
            call.data.get("id"), call.data.get("datum"),
            call.data.get("kategori"), call.data.get("butik"),
            call.data.get("belopp"),
        )

    async def _delete_expense(call: ServiceCall):
        await store.delete_expense(call.data.get("id"))

    async def _add_option(call: ServiceCall):
        await store.add_option(call.data.get("listtyp"), call.data.get("varde"))

    async def _remove_option(call: ServiceCall):
        await store.remove_option(call.data.get("listtyp"), call.data.get("varde"))

    async def _import_data(call: ServiceCall):
        await store.import_data(
            intakter=call.data.get("intakter"),
            utgifter=call.data.get("utgifter"),
            kategorier=call.data.get("kategorier"),
            butiker=call.data.get("butiker"),
            bukettyper=call.data.get("bukettyper"),
        )

    hass.services.async_register(DOMAIN, "add_income", _add_income)
    hass.services.async_register(DOMAIN, "edit_income", _edit_income)
    hass.services.async_register(DOMAIN, "delete_income", _delete_income)
    hass.services.async_register(DOMAIN, "add_expense", _add_expense)
    hass.services.async_register(DOMAIN, "edit_expense", _edit_expense)
    hass.services.async_register(DOMAIN, "delete_expense", _delete_expense)
    hass.services.async_register(DOMAIN, "add_option", _add_option)
    hass.services.async_register(DOMAIN, "remove_option", _remove_option)
    hass.services.async_register(DOMAIN, "import_data", _import_data)

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    unloaded = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unloaded:
        hass.data[DOMAIN].pop(entry.entry_id)
    return unloaded
