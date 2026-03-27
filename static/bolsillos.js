// ── HOPE FINANCE · BolsilloManager ──
class BolsilloManager {
  constructor(apiBase) {
    this.api = apiBase || '';
    this._cache = null;
  }

  async _getState() {
    const r = await fetch(this.api + '/api/state');
    if (!r.ok) throw new Error('Error al obtener estado');
    return r.json();
  }

  async _saveState(data) {
    await fetch(this.api + '/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    this._cache = null;
  }

  async getAll() {
    const d = await this._getState();
    return (d.bolsillos || []).filter(b => !b.oculto);
  }

  // Sugerir bolsillo por historial de movimientos similares
  async sugerir(tipo, concepto) {
    const bolsillos = await this.getAll();
    const scores = {};
    bolsillos.forEach(b => {
      scores[b.id] = 0;
      (b.movimientos || []).forEach(m => {
        if (m.tipo === tipo) scores[b.id]++;
        if (m.concepto && concepto && m.concepto.toLowerCase().includes(concepto.toLowerCase().split(' ')[0])) scores[b.id] += 3;
      });
    });
    const sugerido = bolsillos.sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0))[0];
    return { bolsillos, sugerido: sugerido || null };
  }

  async registrar(id, monto, tipo, concepto, fecha) {
    if (!id || !monto) return;
    const d = await this._getState();
    const b = (d.bolsillos || []).find(b => String(b.id) === String(id));
    if (!b) throw new Error('Bolsillo no encontrado');
    if (!b.movimientos) b.movimientos = [];
    const movId = Date.now();
    b.movimientos.push({ id: movId, tipo, monto, concepto: concepto || 'Movimiento', fecha: fecha || new Date().toISOString().split('T')[0] });
    b.saldo = (b.saldo || 0) + (tipo === 'entrada' ? monto : -monto);
    await this._saveState(d);
    return movId;
  }

  async eliminarMov(bolsilloId, movId) {
    if (!bolsilloId || !movId) return;
    const d = await this._getState();
    const b = (d.bolsillos || []).find(b => String(b.id) === String(bolsilloId));
    if (!b) return;
    const mov = (b.movimientos || []).find(m => m.id == movId);
    if (mov) b.saldo = (b.saldo || 0) - (mov.tipo === 'entrada' ? mov.monto : -mov.monto);
    b.movimientos = (b.movimientos || []).filter(m => m.id != movId);
    await this._saveState(d);
  }

  // Mostrar UI de sugerencia con opción de cambiar
  async pedirConfirmacion(monto, tipo, concepto, fecha, onConfirm) {
    const { bolsillos, sugerido } = await this.sugerir(tipo, concepto);
    if (!bolsillos.length) { if (onConfirm) onConfirm(null); return; }

    // Crear o reusar modal
    let modal = document.getElementById('hf-bolsillo-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'hf-bolsillo-modal';
      modal.className = 'modal-overlay';
      modal.innerHTML = `
        <div class="modal">
          <div class="modal-handle"></div>
          <div class="modal-title">💼 Bolsillo afectado</div>
          <div id="hf-sugerido-info" style="background:var(--bg3);border-radius:12px;padding:12px;margin-bottom:12px">
            <div style="font-size:10px;letter-spacing:2px;color:var(--text2);margin-bottom:4px">SUGERIDO POR HISTORIAL</div>
            <div id="hf-sugerido-nombre" style="font-size:15px;font-weight:700"></div>
            <div id="hf-sugerido-saldo" style="font-size:12px;color:var(--green)"></div>
          </div>
          <select id="hf-bolsillo-sel" class="form-input" style="margin-bottom:16px"></select>
          <button id="hf-btn-confirmar" class="form-submit">✅ Confirmar</button>
          <button onclick="document.getElementById('hf-bolsillo-modal').classList.remove('open');document.body.style.overflow=''" class="btn-ghost">Omitir</button>
        </div>`;
      document.body.appendChild(modal);
    }

    // Llenar select
    const sel = modal.querySelector('#hf-bolsillo-sel');
    const fmt = v => '$' + Math.round(v || 0).toLocaleString('es-MX');
    sel.innerHTML = '<option value="">Sin afectar bolsillo</option>' +
      bolsillos.map(b => `<option value="${b.id}" ${sugerido && b.id == sugerido.id ? 'selected' : ''}>${b.nombre} (${fmt(b.saldo)})</option>`).join('');

    // Info sugerido
    if (sugerido) {
      modal.querySelector('#hf-sugerido-nombre').textContent = sugerido.nombre;
      modal.querySelector('#hf-sugerido-saldo').textContent = fmt(sugerido.saldo);
    }

    // Confirmar
    const btn = modal.querySelector('#hf-btn-confirmar');
    btn.onclick = async () => {
      const id = sel.value;
      modal.classList.remove('open');
      document.body.style.overflow = '';
      if (id) await this.registrar(id, monto, tipo, concepto, fecha);
      if (onConfirm) onConfirm(id);
    };

    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
}

// Instancia global
const HF_Bolsillos = new BolsilloManager();

// Compatibilidad con código anterior
async function hf_getBolsillos() { return HF_Bolsillos.getAll(); }
async function hf_actualizarBolsillo(id, monto, tipo, concepto, fecha) { return HF_Bolsillos.registrar(id, monto, tipo, concepto, fecha); }
async function hf_actualizarBolsillos(movs) {
  for (const m of movs) await HF_Bolsillos.registrar(m.id, m.monto, m.tipo, m.concepto, m.fecha);
}
async function hf_eliminarMovBolsillo(bId, mId) { return HF_Bolsillos.eliminarMov(bId, mId); }
async function hf_llenarSelect(selectId) {
  const bolsillos = await HF_Bolsillos.getAll();
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const fmt = v => '$' + Math.round(v || 0).toLocaleString('es-MX');
  sel.innerHTML = '<option value="">Sin afectar bolsillo</option>' +
    bolsillos.map(b => `<option value="${b.id}">${b.nombre} (${fmt(b.saldo)})</option>`).join('');
}
function hf_inyectarModal() {} // ya no necesario
async function hf_pedirBolsillo(monto, concepto, fecha, cb) {
  await HF_Bolsillos.pedirConfirmacion(monto, 'salida', concepto, fecha, cb);
}
function hf_omitir() {
  const m = document.getElementById('hf-bolsillo-modal');
  if (m) { m.classList.remove('open'); document.body.style.overflow = ''; }
}
function hf_cerrarModal() { hf_omitir(); }
