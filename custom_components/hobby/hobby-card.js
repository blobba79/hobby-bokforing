class HobbyCard extends HTMLElement {
  setConfig(config) {
    if (!config.entity) throw new Error("Ange entity i kortinställningarna");
    this._config = config;
    this._activeTab = "oversikt";
    this._editingIncome = null;
    this._editingExpense = null;
    this._lastDataStr = null;
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
  }

  set hass(hass) {
    this._hass = hass;
    const entity = hass.states[this._config.entity];
    const str = entity ? JSON.stringify(entity.attributes) : null;
    if (str !== this._lastDataStr) {
      this._lastDataStr = str;
      this._data = entity
        ? entity.attributes
        : { intakter: [], utgifter: [], kategorier: [], butiker: [], bukettyper: [] };
      this.render();
    }
  }

  getCardSize() {
    return 8;
  }

  _call(service, data) {
    this._hass.callService("hobby", service, data).then(() => {
      setTimeout(() => this.render(), 500);
    });
  }

  _fmt(n) {
    return (Math.round((n || 0) * 100) / 100).toLocaleString("sv-SE");
  }

  _opts(list, selected) {
    return (list || [])
      .map((o) => `<option value="${o}" ${o === selected ? "selected" : ""}>${o}</option>`)
      .join("");
  }

  render() {
    const d = this._data || {};
    const tab = this._activeTab;
    this.shadowRoot.innerHTML = `
      <style>
        ha-card { padding: 16px; font-family: var(--paper-font-body1_-_font-family, inherit); }
        .tabs { display: flex; gap: 4px; margin-bottom: 16px; border-bottom: 1px solid var(--divider-color); flex-wrap: wrap; }
        .tab { padding: 8px 14px; cursor: pointer; border-radius: 8px 8px 0 0; color: var(--secondary-text-color); font-weight: 500; }
        .tab.active { color: var(--primary-color); border-bottom: 2px solid var(--primary-color); background: var(--secondary-background-color); }
        .summary { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 16px; }
        .stat { flex: 1; min-width: 120px; background: var(--secondary-background-color); border-radius: 10px; padding: 10px 14px; }
        .stat .label { font-size: 12px; color: var(--secondary-text-color); }
        .stat .value { font-size: 20px; font-weight: 600; }
        .result-pos { color: var(--success-color, green); }
        .result-neg { color: var(--error-color, red); }
        table { width: 100%; border-collapse: collapse; font-size: 14px; }
        th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--divider-color); }
        th { color: var(--secondary-text-color); font-weight: 500; font-size: 12px; }
        input, select { background: var(--card-background-color); color: var(--primary-text-color); border: 1px solid var(--divider-color); border-radius: 6px; padding: 4px 6px; font-size: 13px; width: 100%; box-sizing: border-box; }
        .row-actions { display: flex; gap: 4px; white-space: nowrap; }
        button.icon { background: none; border: none; cursor: pointer; font-size: 16px; padding: 2px 6px; color: var(--secondary-text-color); }
        button.icon:hover { color: var(--primary-color); }
        .btn { background: var(--primary-color); color: var(--text-primary-color, white); border: none; border-radius: 8px; padding: 8px 16px; cursor: pointer; font-weight: 500; margin-top: 8px; }
        .add-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(100px,1fr)); gap: 8px; margin-top: 12px; padding: 10px; background: var(--secondary-background-color); border-radius: 10px; }
        .settings-group { margin-bottom: 20px; }
        .chip-list { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
        .chip { background: var(--secondary-background-color); border-radius: 16px; padding: 4px 8px 4px 12px; display: flex; align-items: center; gap: 6px; font-size: 13px; }
        .chip button { background: none; border: none; cursor: pointer; color: var(--secondary-text-color); font-weight: bold; }
        .add-inline { display: flex; gap: 6px; margin-top: 4px; }
        h3 { margin: 4px 0 8px 0; font-size: 15px; }
        .empty { color: var(--secondary-text-color); font-style: italic; padding: 8px 0; }
      </style>
      <ha-card>
        <div class="tabs">
          <div class="tab ${tab === "oversikt" ? "active" : ""}" data-tab="oversikt">Översikt</div>
          <div class="tab ${tab === "intakter" ? "active" : ""}" data-tab="intakter">Intäkter</div>
          <div class="tab ${tab === "utgifter" ? "active" : ""}" data-tab="utgifter">Utgifter</div>
          <div class="tab ${tab === "installningar" ? "active" : ""}" data-tab="installningar">Kategorier &amp; butiker</div>
        </div>
        <div class="content">
          ${tab === "oversikt" ? this._renderOversikt(d) : ""}
          ${tab === "intakter" ? this._renderIntakter(d) : ""}
          ${tab === "utgifter" ? this._renderUtgifter(d) : ""}
          ${tab === "installningar" ? this._renderInstallningar(d) : ""}
        </div>
      </ha-card>
    `;
    this._bindEvents();
  }

  _renderOversikt(d) {
    const resClass = (d.resultat || 0) >= 0 ? "result-pos" : "result-neg";
    const kat = Object.entries(d.utgifter_per_kategori || {}).sort((a, b) => b[1] - a[1]);
    const but = Object.entries(d.utgifter_per_butik || {}).sort((a, b) => b[1] - a[1]);
    const months = ["Jan","Feb","Mar","Apr","Maj","Jun","Jul","Aug","Sep","Okt","Nov","Dec"];
    const mi = d.manadsdata_intakter || {};
    const mu = d.manadsdata_utgifter || {};
    return `
      <div class="summary">
        <div class="stat"><div class="label">Intäkter</div><div class="value">${this._fmt(d.total_intakter)} kr</div></div>
        <div class="stat"><div class="label">Utgifter</div><div class="value">${this._fmt(d.total_utgifter)} kr</div></div>
        <div class="stat"><div class="label">Resultat</div><div class="value ${resClass}">${this._fmt(d.resultat)} kr</div></div>
      </div>
      <div style="display:flex; gap:24px; flex-wrap:wrap;">
        <div style="flex:1; min-width:200px;">
          <h3>Utgifter per kategori</h3>
          <table>${kat.length ? kat.map(([k,v]) => `<tr><td>${k}</td><td>${this._fmt(v)} kr</td></tr>`).join("") : '<tr><td class="empty">Ingen data</td></tr>'}</table>
        </div>
        <div style="flex:1; min-width:200px;">
          <h3>Utgifter per butik</h3>
          <table>${but.length ? but.map(([k,v]) => `<tr><td>${k}</td><td>${this._fmt(v)} kr</td></tr>`).join("") : '<tr><td class="empty">Ingen data</td></tr>'}</table>
        </div>
      </div>
      <h3 style="margin-top:20px;">Månadsvis</h3>
      <table>
        <tr><th>Månad</th><th>Intäkter</th><th>Utgifter</th></tr>
        ${months.map(m => `<tr><td>${m}</td><td>${this._fmt(mi[m])} kr</td><td>${this._fmt(mu[m])} kr</td></tr>`).join("")}
      </table>
    `;
  }

  _renderIntakter(d) {
    const rows = [...(d.intakter || [])].sort((a, b) => (a.datum < b.datum ? 1 : -1));
    const editing = this._editingIncome;
    return `
      <table>
        <tr><th>Datum</th><th>Bukettyp</th><th>Antal</th><th>Pris</th><th>Totalt</th><th></th></tr>
        ${rows.map((r) => {
          if (r.id === editing) {
            return `<tr data-edit-income="${r.id}">
              <td><input type="date" class="f-datum" value="${r.datum || ""}"></td>
              <td><select class="f-bukettyp">${this._opts(d.bukettyper, r.bukettyp)}</select></td>
              <td><input type="number" step="0.01" class="f-antal" value="${r.antal ?? ""}"></td>
              <td><input type="number" step="0.01" class="f-pris" value="${r.pris ?? ""}"></td>
              <td>${this._fmt(r.totalt)}</td>
              <td class="row-actions">
                <button class="icon save-income" data-id="${r.id}" title="Spara">&#x2714;&#xFE0F;</button>
                <button class="icon cancel-edit" title="Avbryt">&#x2716;&#xFE0F;</button>
              </td>
            </tr>`;
          }
          return `<tr>
            <td>${r.datum || ""}</td><td>${r.bukettyp || ""}</td><td>${r.antal ?? ""}</td>
            <td>${r.pris ?? ""}</td><td>${this._fmt(r.totalt)} kr</td>
            <td class="row-actions">
              <button class="icon edit-income" data-id="${r.id}" title="Redigera">&#x270F;&#xFE0F;</button>
              <button class="icon del-income" data-id="${r.id}" title="Ta bort">&#x1F5D1;&#xFE0F;</button>
            </td>
          </tr>`;
        }).join("") || '<tr><td class="empty" colspan="6">Inga intäkter registrerade än</td></tr>'}
      </table>
      <div class="add-form">
        <input type="date" id="ni-datum">
        <select id="ni-bukettyp"><option value="">Bukettyp...</option>${this._opts(d.bukettyper)}</select>
        <input type="number" step="0.01" id="ni-antal" placeholder="Antal">
        <input type="number" step="0.01" id="ni-pris" placeholder="Pris styck">
        <button class="btn" id="add-income">+ Lägg till intäkt</button>
      </div>
    `;
  }

  _renderUtgifter(d) {
    const rows = [...(d.utgifter || [])].sort((a, b) => (a.datum < b.datum ? 1 : -1));
    const editing = this._editingExpense;
    return `
      <table>
        <tr><th>Datum</th><th>Kategori</th><th>Butik</th><th>Belopp</th><th></th></tr>
        ${rows.map((r) => {
          if (r.id === editing) {
            return `<tr data-edit-expense="${r.id}">
              <td><input type="date" class="f-datum" value="${r.datum || ""}"></td>
              <td><select class="f-kategori">${this._opts(d.kategorier, r.kategori)}</select></td>
              <td><select class="f-butik">${this._opts(d.butiker, r.butik)}</select></td>
              <td><input type="number" step="0.01" class="f-belopp" value="${r.belopp ?? ""}"></td>
              <td class="row-actions">
                <button class="icon save-expense" data-id="${r.id}" title="Spara">&#x2714;&#xFE0F;</button>
                <button class="icon cancel-edit" title="Avbryt">&#x2716;&#xFE0F;</button>
              </td>
            </tr>`;
          }
          return `<tr>
            <td>${r.datum || ""}</td><td>${r.kategori || ""}</td><td>${r.butik || ""}</td>
            <td>${this._fmt(r.belopp)} kr</td>
            <td class="row-actions">
              <button class="icon edit-expense" data-id="${r.id}" title="Redigera">&#x270F;&#xFE0F;</button>
              <button class="icon del-expense" data-id="${r.id}" title="Ta bort">&#x1F5D1;&#xFE0F;</button>
            </td>
          </tr>`;
        }).join("") || '<tr><td class="empty" colspan="5">Inga utgifter registrerade än</td></tr>'}
      </table>
      <div class="add-form">
        <input type="date" id="nu-datum">
        <select id="nu-kategori"><option value="">Kategori...</option>${this._opts(d.kategorier)}</select>
        <select id="nu-butik"><option value="">Butik...</option>${this._opts(d.butiker)}</select>
        <input type="number" step="0.01" id="nu-belopp" placeholder="Belopp">
        <button class="btn" id="add-expense">+ Lägg till utgift</button>
      </div>
    `;
  }

  _renderInstallningar(d) {
    const group = (title, listtyp, items) => `
      <div class="settings-group">
        <h3>${title}</h3>
        <div class="chip-list">
          ${(items || []).map((v) => `<div class="chip">${v}<button class="remove-opt" data-listtyp="${listtyp}" data-varde="${v}">&times;</button></div>`).join("") || '<span class="empty">Inga värden ännu</span>'}
        </div>
        <div class="add-inline">
          <input type="text" class="new-opt-input" data-listtyp="${listtyp}" placeholder="Lägg till...">
          <button class="btn add-opt" data-listtyp="${listtyp}" style="margin-top:0;">+</button>
        </div>
      </div>
    `;
    return `
      ${group("Kategorier (utgifter)", "kategorier", d.kategorier)}
      ${group("Butiker", "butiker", d.butiker)}
      ${group("Bukettyper (intäkter)", "bukettyper", d.bukettyper)}
    `;
  }

  _bindEvents() {
    const root = this.shadowRoot;

    root.querySelectorAll(".tab").forEach((el) =>
      el.addEventListener("click", () => {
        this._activeTab = el.dataset.tab;
        this._editingIncome = null;
        this._editingExpense = null;
        this.render();
      })
    );

    root.querySelectorAll(".edit-income").forEach((el) =>
      el.addEventListener("click", () => { this._editingIncome = el.dataset.id; this.render(); })
    );
    root.querySelectorAll(".del-income").forEach((el) =>
      el.addEventListener("click", () => {
        if (confirm("Ta bort denna intäkt?")) this._call("delete_income", { id: el.dataset.id });
      })
    );
    root.querySelectorAll(".save-income").forEach((el) =>
      el.addEventListener("click", () => {
        const tr = el.closest("tr");
        this._call("edit_income", {
          id: el.dataset.id,
          datum: tr.querySelector(".f-datum").value,
          bukettyp: tr.querySelector(".f-bukettyp").value,
          antal: parseFloat(tr.querySelector(".f-antal").value) || 0,
          pris: parseFloat(tr.querySelector(".f-pris").value) || 0,
        });
        this._editingIncome = null;
      })
    );
    const addIncomeBtn = root.querySelector("#add-income");
    if (addIncomeBtn) addIncomeBtn.addEventListener("click", () => {
      this._call("add_income", {
        datum: root.querySelector("#ni-datum").value,
        bukettyp: root.querySelector("#ni-bukettyp").value,
        antal: parseFloat(root.querySelector("#ni-antal").value) || 0,
        pris: parseFloat(root.querySelector("#ni-pris").value) || 0,
      });
    });

    root.querySelectorAll(".edit-expense").forEach((el) =>
      el.addEventListener("click", () => { this._editingExpense = el.dataset.id; this.render(); })
    );
    root.querySelectorAll(".del-expense").forEach((el) =>
      el.addEventListener("click", () => {
        if (confirm("Ta bort denna utgift?")) this._call("delete_expense", { id: el.dataset.id });
      })
    );
    root.querySelectorAll(".save-expense").forEach((el) =>
      el.addEventListener("click", () => {
        const tr = el.closest("tr");
        this._call("edit_expense", {
          id: el.dataset.id,
          datum: tr.querySelector(".f-datum").value,
          kategori: tr.querySelector(".f-kategori").value,
          butik: tr.querySelector(".f-butik").value,
          belopp: parseFloat(tr.querySelector(".f-belopp").value) || 0,
        });
        this._editingExpense = null;
      })
    );
    const addExpenseBtn = root.querySelector("#add-expense");
    if (addExpenseBtn) addExpenseBtn.addEventListener("click", () => {
      this._call("add_expense", {
        datum: root.querySelector("#nu-datum").value,
        kategori: root.querySelector("#nu-kategori").value,
        butik: root.querySelector("#nu-butik").value,
        belopp: parseFloat(root.querySelector("#nu-belopp").value) || 0,
      });
    });

    root.querySelectorAll(".cancel-edit").forEach((el) =>
      el.addEventListener("click", () => {
        this._editingIncome = null;
        this._editingExpense = null;
        this.render();
      })
    );

    root.querySelectorAll(".remove-opt").forEach((el) =>
      el.addEventListener("click", () => {
        this._call("remove_option", { listtyp: el.dataset.listtyp, varde: el.dataset.varde });
      })
    );
    root.querySelectorAll(".add-opt").forEach((el) =>
      el.addEventListener("click", () => {
        const input = root.querySelector(`.new-opt-input[data-listtyp="${el.dataset.listtyp}"]`);
        if (input.value.trim()) {
          this._call("add_option", { listtyp: el.dataset.listtyp, varde: input.value.trim() });
          input.value = "";
        }
      })
    );
  }
}

customElements.define("hobby-card", HobbyCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "hobby-card",
  name: "Hobby Bokföring",
  description: "Bokföringskort för hobbyverksamheter med intäkter, utgifter och kategorier",
});
