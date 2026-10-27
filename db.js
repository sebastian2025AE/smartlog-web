/* ============================================================
   Capa de datos de Smartlog.
   - Con Firebase configurado: Realtime Database (todos los celulares ven lo mismo en vivo).
   - Sin Firebase: modo local (localStorage + BroadcastChannel; solo este navegador).
   Las páginas usan siempre la misma API: DB.*
   ============================================================ */
(function () {
  const CFG = window.SMARTLOG_CONFIG || {};
  const fb = CFG.firebase || {};
  const usaFirebase = !!fb.apiKey && !/PEGA_AQUI/.test(fb.apiKey) && !/PEGA_AQUI/.test(fb.databaseURL || '');
  const T0 = Date.now();
  const listo = [];

  const DB = { modo: usaFirebase ? 'firebase' : 'local', conectado: !usaFirebase, onConexion: () => {} };
  window.DB = DB;

  /* ---------------- utilidades ---------------- */
  const ordenarTs = (a, b) => (a.ts || 0) - (b.ts || 0);
  const objAArray = o => Object.entries(o || {}).map(([id, v]) => ({ id, ...v })).sort(ordenarTs);
  function diaLima(ts = Date.now()) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ts);
  }
  DB.diaLima = diaLima;
  const nuevoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  /* ============================================================
     MODO LOCAL
     ============================================================ */
  function iniciarLocal() {
    const KEY = 'smartlog-db-v1';
    const canal = ('BroadcastChannel' in window) ? new BroadcastChannel('smartlog-db') : null;
    const subs = [];                                   // {ruta, cb}
    const leer = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (_) { return {}; } };
    const guardar = d => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (_) {} };
    const get = (d, ruta) => ruta.split('/').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), d);
    function set(d, ruta, valor) {
      const ks = ruta.split('/'); let o = d;
      ks.slice(0, -1).forEach(k => { if (typeof o[k] !== 'object' || o[k] === null) o[k] = {}; o = o[k]; });
      if (valor === null) delete o[ks[ks.length - 1]]; else o[ks[ks.length - 1]] = valor;
    }
    function avisar(rutaCambiada, origenLocal, extra) {
      const d = leer();
      subs.forEach(s => { if (s.ruta === rutaCambiada || rutaCambiada === '*') s.cb(get(d, s.ruta), extra); });
    }
    const emitir = (ruta, extra) => { try { canal && canal.postMessage({ ruta, extra }); } catch (_) {} };
    if (canal) canal.onmessage = e => avisar(e.data.ruta, false, e.data.extra);
    window.addEventListener('storage', e => { if (e.key === KEY) avisar('*', false); });

    DB._escribir = (ruta, valor, rutaSub, extra) => {
      const d = leer(); set(d, ruta, valor); guardar(d);
      avisar(rutaSub || ruta, true, extra); emitir(rutaSub || ruta, extra);
    };
    DB._suscribir = (ruta, cb) => {
      const s = { ruta, cb }; subs.push(s);
      setTimeout(() => cb(get(leer(), ruta), undefined), 0);
      return () => { const i = subs.indexOf(s); if (i >= 0) subs.splice(i, 1); };
    };
    DB._leer = ruta => get(leer(), ruta);
    DB._push = (ruta, valor, extra) => {
      const id = nuevoId(); DB._escribir(ruta + '/' + id, valor, ruta, extra ? { id, ...valor } : undefined); return id;
    };
    DB.conectado = true;
  }

  /* ============================================================
     MODO FIREBASE
     ============================================================ */
  function cargarScript(src) {
    return new Promise((ok, mal) => {
      const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => mal(new Error('No cargó ' + src));
      document.head.appendChild(s);
    });
  }
  let fdb = null;
  function iniciarFirebase() {
    const V = '10.12.2';
    const p = cargarScript(`https://www.gstatic.com/firebasejs/${V}/firebase-app-compat.js`)
      .then(() => cargarScript(`https://www.gstatic.com/firebasejs/${V}/firebase-database-compat.js`))
      .then(() => {
        firebase.initializeApp(fb);
        fdb = firebase.database();
        fdb.ref('.info/connected').on('value', s => { DB.conectado = !!s.val(); DB.onConexion(DB.conectado); });
      })
      .catch(err => { console.error(err); DB.modo = 'local'; DB.error = 'No se pudo cargar Firebase: se usa modo local.'; iniciarLocal(); });
    listo.push(p);
    DB._escribir = (ruta, valor) => { fdb.ref(ruta).set(valor); };
    DB._suscribir = (ruta, cb) => { const r = fdb.ref(ruta); const f = r.on('value', s => cb(s.val())); return () => r.off('value', f); };
    DB._leer = ruta => fdb.ref(ruta).get().then(s => s.val());
    DB._push = (ruta, valor) => { const r = fdb.ref(ruta).push(); r.set(valor); return r.key; };
  }

  if (usaFirebase) iniciarFirebase(); else iniciarLocal();
  DB.listo = () => Promise.all(listo);

  /* Envolvemos las funciones públicas para esperar a que Firebase termine de cargar */
  const espera = fn => (...a) => DB.listo().then(() => fn(...a));

  /* ============================================================
     API PÚBLICA
     ============================================================ */

  // ---- Eventos del día: /eventos/{dia}/{id} = {ts, tipo:'entrada'|'salida', cat, origen, lote, quien}
  DB.pushEvento = espera(ev => {
    const e = { ts: Date.now(), ...ev };
    const dia = diaLima(e.ts);
    return DB._push('eventos/' + dia, e, true);
  });

  // cb(arrayDeEventos, eventoNuevo|null). El segundo argumento solo llega cuando entra uno nuevo.
  DB.onEventos = (dia, cb) => {
    let off = () => {}, cancelado = false, conocidos = new Set(), primera = true;
    DB.listo().then(() => {
      if (cancelado) return;
      off = DB._suscribir('eventos/' + dia, (obj) => {
        const arr = objAArray(obj);
        const nuevos = primera ? [] : arr.filter(e => !conocidos.has(e.id));
        arr.forEach(e => conocidos.add(e.id));
        if (primera || !nuevos.length) cb(arr, null);
        else nuevos.forEach(n => cb(arr, n));
        primera = false;
      });
    });
    return () => { cancelado = true; off(); };
  };

  // ---- Estado de la máquina: /estado = {maquina, modo, servo, operador, ts, online}
  DB.setEstado = espera(parcial => {
    const actual = DB._leer('estado');
    return Promise.resolve(actual).then(a => DB._escribir('estado', { ...(a || {}), ...parcial, ts: Date.now() }));
  });
  DB.onEstado = cb => {
    let off = () => {}, cancelado = false;
    DB.listo().then(() => { if (!cancelado) off = DB._suscribir('estado', v => cb(v || {})); });
    return () => { cancelado = true; off(); };
  };

  // ---- Comandos remotos (paro desde el admin): /comando = {tipo, ts, quien}
  DB.enviarComando = espera(c => DB._escribir('comando', { ...c, ts: Date.now() }));
  DB.onComando = cb => {
    let off = () => {}, cancelado = false;
    DB.listo().then(() => {
      if (cancelado) return;
      off = DB._suscribir('comando', v => { if (v && v.ts > T0) cb(v); });
    });
    return () => { cancelado = true; off(); };
  };

  // ---- Visitantes: /visitantes/{dia}/{id} = {nombre, institucion, rol, ts}
  DB.registrarVisitante = espera(v => DB._push('visitantes/' + diaLima(), { ts: Date.now(), ...v }));
  DB.onVisitantes = (dia, cb) => {
    let off = () => {}, cancelado = false;
    DB.listo().then(() => { if (!cancelado) off = DB._suscribir('visitantes/' + dia, o => cb(objAArray(o))); });
    return () => { cancelado = true; off(); };
  };

  // ---- Lotes de prueba terminados: /lotes/{dia}/{id} = {nombre, quien, total, conteo:{...}, ts}
  DB.guardarLote = espera(l => DB._push('lotes/' + diaLima(), { ts: Date.now(), ...l }));
  DB.onLotes = (dia, cb) => {
    let off = () => {}, cancelado = false;
    DB.listo().then(() => { if (!cancelado) off = DB._suscribir('lotes/' + dia, o => cb(objAArray(o))); });
    return () => { cancelado = true; off(); };
  };

  // ---- Días con datos (para el selector del admin)
  DB.dias = espera(() => Promise.resolve(DB._leer('eventos')).then(o => Object.keys(o || {}).sort().reverse()));

  // ---- Borrar un día (solo admin)
  DB.borrarDia = espera(dia => {
    DB._escribir('eventos/' + dia, null); DB._escribir('visitantes/' + dia, null); DB._escribir('lotes/' + dia, null);
  });
})();
