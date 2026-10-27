/* ============================================================
   Utilidades compartidas de Smartlog (global: SL)
   ============================================================ */
(function () {
  const SL = {};
  window.SL = SL;

  /* ---------- Categorías de limón ---------- */
  SL.CATS = {
    VERDE: {
      id: 'VERDE', nombre: 'Verde', estado: 'Fresco', forma: 'circulo', angulo: 20, aprovechable: true,
      desc: 'Fruta firme y verde. Es la ideal para venta y exportación.'
    },
    AMARILLO: {
      id: 'AMARILLO', nombre: 'Amarillo', estado: 'Maduro', forma: 'triangulo', angulo: 90, aprovechable: true,
      desc: 'Fruta madura. Conviene aprovecharla pronto: jugo o procesamiento.'
    },
    DESCARTE: {
      id: 'DESCARTE', nombre: 'Descarte', estado: 'Podrido o dañado', forma: 'cuadrado', angulo: 160, aprovechable: false,
      desc: 'Manchas oscuras o marrones. No es aprovechable.'
    }
  };
  SL.ORDEN = ['VERDE', 'AMARILLO', 'DESCARTE'];
  SL.ANGULO_REPOSO = 90;

  // Colores por tema (se leen de las variables CSS para que cambien con el tema)
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  SL.color = id => css('--c-' + id.toLowerCase());
  SL.tinta = id => css('--t-' + id.toLowerCase());

  SL.glifo = function (id, tam = 16, fill) {
    const c = fill || SL.color(id), f = SL.CATS[id].forma;
    const forma = f === 'circulo' ? '<circle cx="8" cy="8" r="7"/>'
      : f === 'triangulo' ? '<path d="M8 1 L15.5 14.5 H.5 Z"/>'
        : '<rect x="1" y="1" width="14" height="14" rx="2"/>';
    return `<svg width="${tam}" height="${tam}" viewBox="0 0 16 16" fill="${c}" aria-hidden="true">${forma}</svg>`;
  };

  /* ---------- Fechas ---------- */
  SL.hoy = () => DB.diaLima();
  SL.hora = (ts = Date.now()) => new Date(ts).toLocaleTimeString('es-PE', { hour12: false, timeZone: 'America/Lima' });
  SL.horaCorta = ts => new Date(ts).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Lima' });
  SL.horaDe = ts => +new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'America/Lima' }).format(ts) % 24;
  SL.fechaLarga = dia => { const t = new Date(dia + 'T12:00:00').toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); return t.charAt(0).toUpperCase() + t.slice(1); };

  /* ---------- Sesión (quién entró) ---------- */
  SL.sesion = () => { try { return JSON.parse(localStorage.getItem('sl-sesion')) || null; } catch (_) { return null; } };
  SL.guardarSesion = s => { try { localStorage.setItem('sl-sesion', JSON.stringify(s)); } catch (_) {} };
  SL.cerrarSesion = () => { try { localStorage.removeItem('sl-sesion'); } catch (_) {} };
  // Si la persona no tiene el rol pedido, vuelve a la entrada con un aviso
  SL.exigirRol = function (...roles) {
    const s = SL.sesion();
    if (!s || !roles.includes(s.rol)) { location.replace('index.html?necesitas=' + roles[0]); return null; }
    return s;
  };

  /* ---------- Resumen de eventos ---------- */
  SL.resumir = function (eventos) {
    const r = {
      entradas: 0, salidas: 0, porCat: { VERDE: 0, AMARILLO: 0, DESCARTE: 0 },
      entHora: Array(24).fill(0), salHora: Array(24).fill(0), porOrigen: {}, ultimoMin: 0
    };
    const hace1m = Date.now() - 60000;
    (eventos || []).forEach(e => {
      const h = SL.horaDe(e.ts);
      if (e.tipo === 'entrada') { r.entradas++; r.entHora[h]++; }
      else if (e.tipo === 'salida' && r.porCat[e.cat] !== undefined) {
        r.salidas++; r.porCat[e.cat]++; r.salHora[h]++;
        r.porOrigen[e.origen || 'operador'] = (r.porOrigen[e.origen || 'operador'] || 0) + 1;
        if (e.ts > hace1m) r.ultimoMin++;
      }
    });
    r.aprovechables = r.porCat.VERDE + r.porCat.AMARILLO;
    r.pctAprov = r.salidas ? Math.round(r.aprovechables * 100 / r.salidas) : 0;
    r.enProceso = Math.max(0, r.entradas - r.salidas);   // entraron y aún no salen clasificados
    return r;
  };

  /* ---------- Resultado de un lote ---------- */
  SL.analizarLote = function (c) {
    const v = c.VERDE || 0, a = c.AMARILLO || 0, d = c.DESCARTE || 0, total = v + a + d;
    const aprov = v + a;
    const pct = total ? Math.round(aprov * 100 / total) : 0;
    const pd = total ? Math.round(d * 100 / total) : 0;
    let veredicto, nivel;
    if (!total) { veredicto = 'Aún no hay limones en este lote.'; nivel = 'neutro'; }
    else if (pct >= 90) { veredicto = 'Lote excelente: casi todo se puede aprovechar.'; nivel = 'bien'; }
    else if (pct >= 75) { veredicto = 'Lote bueno: la mayor parte se puede aprovechar.'; nivel = 'bien'; }
    else if (pct >= 55) { veredicto = 'Lote regular: hay una merma importante.'; nivel = 'medio'; }
    else { veredicto = 'Lote con mucha merma: conviene revisar el origen y el almacenamiento.'; nivel = 'mal'; }
    const rec = [];
    if (v) rec.push(`${v} limón${v === 1 ? '' : 'es'} verde${v === 1 ? '' : 's'}: venta o exportación.`);
    if (a) rec.push(`${a} limón${a === 1 ? '' : 'es'} amarillo${a === 1 ? '' : 's'}: aprovecharlos pronto para jugo o procesamiento.`);
    if (d) rec.push(`${d} limón${d === 1 ? '' : 'es'} podrido${d === 1 ? '' : 's'} o dañado${d === 1 ? '' : 's'}: se retiran para no contaminar al resto.`);
    return { total, verde: v, amarillo: a, descarte: d, aprov, pct, pd, veredicto, nivel, rec };
  };

  /* ---------- Tema ---------- */
  SL.aplicarTema = function (t) {
    document.documentElement.dataset.tema = t;
    try { localStorage.setItem('sl-tema', t); } catch (_) {}
    document.dispatchEvent(new CustomEvent('sl-tema', { detail: t }));
  };
  (function () {
    let t = 'claro';
    try { t = localStorage.getItem('sl-tema') || 'claro'; } catch (_) {}
    document.documentElement.dataset.tema = t;
  })();

  /* ---------- Cabecera ---------- */
  const NAV = [
    ['index.html', 'Inicio'],
    ['jurado.html', 'Lote de prueba'],
    ['operador.html', 'Operador'],
    ['stand.html', 'Stand'],
    ['admin.html', 'Admin'],
    ['creditos.html', 'Fuentes']
  ];
  SL.cabecera = function (activa) {
    const el = document.getElementById('cabecera'); if (!el) return;
    const s = SL.sesion();
    el.innerHTML = `
      <header class="cab">
        <div class="cab-in">
          <a class="marca" href="index.html" aria-label="Smartlog, ir al inicio">
            <span class="marca-logo" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 22 22"><rect x="1" y="9" width="20" height="5" rx="2.5" fill="currentColor"/><circle cx="5" cy="17.5" r="2.5" fill="currentColor"/><circle cx="17" cy="17.5" r="2.5" fill="currentColor"/><circle cx="11" cy="4.5" r="3.5" fill="var(--celeste)"/></svg></span>
            <span><b>Smartlog</b><small>Clasificador de limones · UTEC</small></span>
          </a>
          <nav class="nav" aria-label="Secciones">
            ${NAV.map(([h, t]) => `<a href="${h}" ${h === activa ? 'aria-current="page"' : ''}>${t}</a>`).join('')}
          </nav>
          <div class="cab-der">
            <span id="pillDatos" class="pill" title="Dónde se guardan los datos"></span>
            ${s ? `<span class="quien" title="Sesión">${(s.nombre || s.rol).replace(/</g, '&lt;')}</span>` : ''}
            <button id="btnTema" class="btn btn-sm btn-fantasma" aria-label="Cambiar entre tema claro y oscuro" title="Tema claro / oscuro">◐ Tema</button>
          </div>
        </div>
      </header>`;
    document.getElementById('btnTema').addEventListener('click', () =>
      SL.aplicarTema(document.documentElement.dataset.tema === 'claro' ? 'oscuro' : 'claro'));
    const pill = document.getElementById('pillDatos');
    const pintar = () => {
      const fbOk = DB.modo === 'firebase';
      pill.className = 'pill ' + (fbOk ? (DB.conectado ? 'ok' : 'warn') : 'warn');
      pill.innerHTML = `<i class="dot"></i>${fbOk ? (DB.conectado ? 'En vivo (Firebase)' : 'Reconectando…') : 'Modo local'}`;
      pill.title = fbOk ? 'Los datos se comparten en tiempo real con todos los dispositivos.'
        : 'Firebase no está configurado: los datos solo se comparten entre pestañas de este navegador.';
    };
    pintar(); DB.onConexion = pintar; setTimeout(pintar, 1500);
  };

  /* ---------- Aviso breve ---------- */
  SL.toast = function (msg, tipo = 'ok') {
    let c = document.getElementById('toasts');
    if (!c) { c = document.createElement('div'); c.id = 'toasts'; c.setAttribute('role', 'status'); c.setAttribute('aria-live', 'polite'); document.body.appendChild(c); }
    const t = document.createElement('div'); t.className = 'toast ' + tipo; t.textContent = msg; c.appendChild(t);
    setTimeout(() => t.classList.add('sale'), 3200); setTimeout(() => t.remove(), 3700);
  };

  /* ---------- Escape HTML ---------- */
  SL.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  /* ---------- Descargar archivo ---------- */
  SL.descargar = function (nombre, contenido, tipo = 'text/csv;charset=utf-8') {
    const blob = new Blob(['﻿' + contenido], { type: tipo });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nombre; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
})();
