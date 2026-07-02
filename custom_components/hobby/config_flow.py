"""Config flow for Hobby integration."""
from __future__ import annotations

import re
from pathlib import Path

import voluptuous as vol

from homeassistant.config_entries import ConfigFlow, ConfigFlowResult
from homeassistant.const import CONF_NAME

from .const import CONF_DATA_DIR, DEFAULT_DATA_DIR, DOMAIN


def _slugify(name: str) -> str:
    """Convert a name to a filesystem-safe slug."""
    s = name.lower().strip()
    s = re.sub(r"[åäö]", lambda m: {"å": "a", "ä": "a", "ö": "o"}[m.group()], s)
    s = re.sub(r"[^a-z0-9]+", "_", s)
    return s.strip("_")


class HobbyConfigFlow(ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input=None) -> ConfigFlowResult:
        errors = {}

        if user_input is not None:
            name = user_input[CONF_NAME].strip()
            data_dir = user_input[CONF_DATA_DIR].strip()

            if not name:
                errors["name"] = "empty_name"
            elif not data_dir:
                errors["data_dir"] = "empty_path"
            else:
                path = Path(data_dir)
                try:
                    path.mkdir(parents=True, exist_ok=True)
                except Exception:
                    errors["data_dir"] = "cannot_create"
                else:
                    return self.async_create_entry(
                        title=name,
                        data={CONF_NAME: name, CONF_DATA_DIR: data_dir},
                    )

        suggestions = {
            slug: f"{DEFAULT_DATA_DIR}/{slug}"
            for slug in ["hobby_1", "hobby_2"]
        }

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema({
                vol.Required(CONF_NAME): str,
                vol.Required(CONF_DATA_DIR, default=f"{DEFAULT_DATA_DIR}/"): str,
            }),
            errors=errors,
        )
