/* RadNavi Rur-Eifel – sichere Rad-Navigation (Gravelbike / MTB)
   Routing: BRouter mit eigenem Sicherheitsprofil (profile.brf)
   Radweg-Prüfung: Auswertung der OSM-Tags jedes Routenabschnitts */
'use strict';
(function () {

// ------------------------------------------------------------------ Konstanten
const REGIONS = {
  eifel: {
    // ganz Europa, Startansicht Düren (Schlüssel bleibt 'eifel', damit gespeicherte Einstellungen gelten)
    name: 'Europa', area: 'Europa',
    bounds: L.latLngBounds([34.0, -25.0], [71.5, 45.0]), home: [50.80, 6.48], zoom: 11,
    hw: { unclassified: 'Verbindungsstraße', road: 'Straße', tertiary: 'Kreis-/Nebenstraße', tertiary_link: 'Kreis-/Nebenstraße',
      secondary: 'Landstraße', secondary_link: 'Landstraße', primary: 'Hauptstraße', primary_link: 'Hauptstraße',
      trunk: 'Schnellstraße', trunk_link: 'Schnellstraße' },
  },
  austria: {
    // Wien, Niederösterreich, Burgenland, Oberösterreich, Steiermark
    name: 'Österreich Ost', area: 'Wien, Niederösterreich, Burgenland, Oberösterreich und Steiermark',
    bounds: L.latLngBounds([46.35, 12.70], [49.10, 17.20]), home: [48.2082, 16.3738], zoom: 11,
    hw: { unclassified: 'Gemeindestraße', road: 'Straße', tertiary: 'Landesstraße', tertiary_link: 'Landesstraße',
      secondary: 'Landesstraße B', secondary_link: 'Landesstraße B', primary: 'Bundesstraße', primary_link: 'Bundesstraße',
      trunk: 'Schnellstraße', trunk_link: 'Schnellstraße' },
  },
  mallorca: {
    name: 'Mallorca', area: 'Mallorca',
    bounds: L.latLngBounds([39.20, 2.25], [40.00, 3.55]), home: [39.62, 2.95], zoom: 10,
    hw: { unclassified: 'Nebenstraße', road: 'Straße', tertiary: 'Nebenstraße', tertiary_link: 'Nebenstraße',
      secondary: 'Landstraße', secondary_link: 'Landstraße', primary: 'Hauptstraße', primary_link: 'Hauptstraße',
      trunk: 'Schnellstraße', trunk_link: 'Schnellstraße' },
  },
};
const BROUTER = 'https://brouter.de/brouter';
const PHOTON = 'https://photon.komoot.io';

// Kategorien der Radweg-Prüfung. verified = eindeutig als Radverkehrsanlage eingetragen
const CATS = {
  radweg:   { label: 'Radweg (ausgewiesen)',     color: '#047857', verified: true, onto: 'auf den Radweg' },
  fstrasse: { label: 'Fahrradstraße',            color: '#059669', verified: true, onto: 'in die Fahrradstraße' },
  cwtrack:  { label: 'Radweg neben Fahrbahn',    color: '#10b981', verified: true, onto: 'auf den Radweg neben der Fahrbahn' },
  cwlane:   { label: 'Radfahrstreifen',          color: '#84cc16', onto: 'auf den Radfahrstreifen' },
  gehrad:   { label: 'Autofreier Weg, Rad frei', color: '#06b6d4', onto: 'auf den autofreien Weg' },
  track:    { label: 'Wirtschaftsweg',           color: '#3b82f6', onto: 'auf den Wirtschaftsweg' },
  path:     { label: 'Pfad / Trail',             color: '#8b5cf6', onto: 'auf den Pfad' },
  ruhig:    { label: 'Wohn-/Nebenstraße',        color: '#eab308', onto: 'in die Nebenstraße' },
  strasse:  { label: 'Straße mit Autoverkehr',   color: '#f97316', onto: 'auf die Straße. Achtung, Autoverkehr', warn: true },
  haupt:    { label: 'Hauptstraße ohne Radweg',  color: '#dc2626', onto: 'auf die Hauptstraße ohne Radweg. Vorsicht', warn: true },
  schieben: { label: 'Schieben / Treppe',        color: '#6b7280', onto: 'bitte absteigen und schieben', warn: true },
  sonst:    { label: 'Sonstiges',                color: '#94a3b8', onto: '' },
};
const CAT_ORDER = ['radweg', 'fstrasse', 'cwtrack', 'cwlane', 'gehrad', 'track', 'path', 'ruhig', 'strasse', 'haupt', 'schieben', 'sonst'];

// ------------------------------------------------------------------ Helfer
const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem('radnavi.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('radnavi.' + k, JSON.stringify(v)); } catch (e) { /* egal */ } },
};
const nf1 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
function fmtKm(m) { return m < 1000 ? nf0.format(Math.round(m / 10) * 10) + ' m' : nf1.format(m / 1000) + ' km'; }
function fmtDist(m) {
  if (m < 1000) { const r = m < 100 ? 10 : 50; return nf0.format(Math.max(r, Math.round(m / r) * r)) + ' m'; }
  return nf1.format(m / 1000) + ' km';
}
function sayDist(m) {
  if (m < 1000) { const r = m < 100 ? 10 : 50; return Math.max(r, Math.round(m / r) * r) + ' Metern'; }
  const km = Math.round(m / 100) / 10;
  return (km === 1 ? 'einem' : String(km).replace('.', ',')) + ' Kilometer' + (km === 1 ? '' : 'n');
}
function fmtDur(s) {
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
  return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
}
function pct(x) { return nf0.format(Math.round(x * 100)) + ' %'; }
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function hav(a, b) {
  const R = 6371008.8, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}
function projSeg(p, a, b) {
  const kx = 111320 * Math.cos(p.lat * Math.PI / 180), ky = 110540;
  const ax = (a.lon - p.lon) * kx, ay = (a.lat - p.lat) * ky;
  const dx = (b.lon - a.lon) * kx, dy = (b.lat - a.lat) * ky;
  const L2 = dx * dx + dy * dy;
  let t = L2 > 0 ? -(ax * dx + ay * dy) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  return { d: Math.hypot(ax + t * dx, ay + t * dy), t };
}
function bearing(a, b) {
  const r = Math.PI / 180;
  const y = Math.sin((b.lon - a.lon) * r) * Math.cos(b.lat * r);
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lon - a.lon) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
}
function idxAtDist(D, d) { let lo = 0, hi = D.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (D[m] <= d) lo = m; else hi = m - 1; } return lo; }

let toastTimer = null;
function toast(msg, ms = 4500) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

// ------------------------------------------------------------------ Zustand
const S = {
  mode: store.get('mode', 'gravel') === 'mtb' ? 'mtb' : 'gravel',
  safety: store.get('safety', 1.0),
  hills: store.get('hills', false),
  voice: store.get('voice', true),
  layer: store.get('layer', 'cyclosm'),
  region: store.get('region', 'eifel'),
  start: null, dest: null, route: null, alt: 0, pos: null, nav: null,
};
if (!REGIONS[S.region]) S.region = 'eifel';
let RG = REGIONS[S.region];

// ------------------------------------------------------------------ Karte
const map = L.map('map', { zoomControl: false, maxBounds: RG.bounds.pad(0.1), minZoom: 4, attributionControl: true }).setView(RG.home, RG.zoom);
map.attributionControl.setPrefix(false);
const LAYERS = {
  cyclosm: L.tileLayer('https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png', { maxZoom: 19, subdomains: 'abc',
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · <a href="https://www.cyclosm.org">CyclOSM</a>' }),
  osm: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19,
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }),
  topo: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17, subdomains: 'abc',
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, SRTM · © OpenTopoMap (CC-BY-SA)' }),
};
let baseLayer = null;
function setLayer(name) {
  if (!LAYERS[name]) name = 'cyclosm';
  if (baseLayer) map.removeLayer(baseLayer);
  baseLayer = LAYERS[name].addTo(map);
  S.layer = name; store.set('layer', name);
  document.querySelectorAll('#layerSeg button').forEach((b) => b.classList.toggle('active', b.dataset.layer === name));
}
setLayer(S.layer);
L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);

function updateInsets() {
  const sheet = $('routeSheet'), nb = $('navBottom');
  let h = 0;
  if (!nb.hidden) h = nb.offsetHeight; else if (!sheet.hidden) h = sheet.offsetHeight;
  document.documentElement.style.setProperty('--bottom-ui', h + 'px');
  const top = !$('navTop').hidden ? $('navTop').offsetHeight : $('planner').offsetHeight;
  document.documentElement.style.setProperty('--top-ui', top + 'px');
}
function fitPadding() {
  const top = (!$('planner').hidden ? $('planner').getBoundingClientRect().bottom : 0) + 16;
  const sheet = $('routeSheet');
  const bottom = (!sheet.hidden ? sheet.offsetHeight : 0) + 16;
  return { paddingTopLeft: [16, top], paddingBottomRight: [16, bottom] };
}

// ------------------------------------------------------------------ Start/Ziel
function pinIcon(cls) { return L.divIcon({ className: 'pin ' + cls, html: '<span></span>', iconSize: [26, 26], iconAnchor: [13, 13] }); }
const markers = { start: null, dest: null };
function inputOf(which) { return which === 'start' ? $('inStart') : $('inDest'); }

function setPoint(which, pt) {
  S[which] = pt;
  inputOf(which).value = pt ? pt.label : '';
  let m = markers[which];
  if (!pt || pt.isGps) {
    if (m) { map.removeLayer(m); markers[which] = null; }
  } else if (!m) {
    m = L.marker([pt.lat, pt.lon], { icon: pinIcon(which), draggable: true, zIndexOffset: 500 }).addTo(map);
    m.on('dragend', () => {
      const ll = m.getLatLng();
      setPoint(which, { lat: ll.lat, lon: ll.lng, label: 'Kartenpunkt' });
      reverseLabel(which);
      computeRoute();
    });
    markers[which] = m;
  } else {
    m.setLatLng([pt.lat, pt.lon]);
  }
  if (which === 'dest' && pt) rememberRecent(pt);
}

async function reverseLabel(which) {
  const pt = S[which]; if (!pt) return;
  try {
    const r = await fetch(`${PHOTON}/reverse?lon=${pt.lon}&lat=${pt.lat}&lang=de&limit=1`);
    const j = await r.json(); const f = j.features && j.features[0];
    if (f && S[which] === pt) { pt.label = photonLabel(f.properties) || pt.label; inputOf(which).value = pt.label; }
  } catch (e) { /* Label bleibt "Kartenpunkt" */ }
}

function photonLabel(p) {
  const street = [p.street, p.housenumber].filter(Boolean).join(' ');
  const place = p.city || p.town || p.village || p.district || p.locality || '';
  const main = p.name || street || place;
  return main && place && main !== place ? `${main}, ${place}` : main;
}
function photonSub(p) {
  const street = p.name && p.street ? [p.street, p.housenumber].filter(Boolean).join(' ') : '';
  return [street, [p.postcode, p.city || p.town || p.village || p.county].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}

function rememberRecent(pt) {
  if (pt.label === 'Kartenpunkt') return;
  const key = 'recent.' + S.region;
  const list = store.get(key, []).filter((r) => r.label !== pt.label);
  list.unshift({ lat: pt.lat, lon: pt.lon, label: pt.label });
  store.set(key, list.slice(0, 6));
}

// ------------------------------------------------------------------ Suche
let searchFor = null, searchTimer = null, searchSeq = 0;
function showResults(which, items, msg) {
  const box = $('results');
  box.innerHTML = '';
  const add = (title, sub, fn) => {
    const b = document.createElement('button'); b.type = 'button';
    b.innerHTML = `<b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}`;
    b.addEventListener('click', fn); box.appendChild(b);
  };
  if (which === 'start') add('Mein Standort', 'GPS', () => choose('start', { isGps: true, label: 'Mein Standort' }));
  items.forEach((it) => add(it.label, it.sub, () => choose(which, it)));
  if (msg) { const d = document.createElement('div'); d.className = 'msg'; d.textContent = msg; box.appendChild(d); }
  box.hidden = !box.children.length;
  updateInsets();
}
function hideResults() { $('results').hidden = true; searchFor = null; }
function choose(which, pt) {
  setPoint(which, { lat: pt.lat, lon: pt.lon, label: pt.label, isGps: !!pt.isGps });
  hideResults(); inputOf(which).blur();
  if (which === 'dest' && !S.start) setPoint('start', { isGps: true, label: 'Mein Standort' });
  computeRoute();
}
function recentItems() { return store.get('recent.' + S.region, S.region === 'eifel' ? store.get('recent', []) : []).map((r) => ({ ...r, sub: 'Zuletzt gesucht' })); }

async function doSearch(q, which) {
  const seq = ++searchSeq;
  const c = map.getCenter();
  const b = RG.bounds;
  const url = `${PHOTON}/api/?q=${encodeURIComponent(q)}&lang=de&limit=7&bbox=${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}&lat=${c.lat.toFixed(3)}&lon=${c.lng.toFixed(3)}`;
  try {
    const r = await fetch(url); const j = await r.json();
    if (seq !== searchSeq || searchFor !== which) return;
    const items = (j.features || []).map((f) => ({ lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], label: photonLabel(f.properties), sub: photonSub(f.properties) }))
      .filter((it) => it.label);
    showResults(which, items, items.length ? '' : 'Nichts gefunden im Gebiet ' + RG.area);
  } catch (e) {
    if (seq === searchSeq) showResults(which, [], 'Suche gerade nicht erreichbar – Punkt auf der Karte antippen');
  }
}
function bindSearch(which) {
  const input = inputOf(which);
  input.addEventListener('focus', () => { searchFor = which; input.select(); showResults(which, input.value.length < 3 || (S[which] && input.value === S[which].label) ? recentItems() : []); });
  input.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = input.value.trim();
    if (q.length < 3) { showResults(which, recentItems()); return; }
    searchTimer = setTimeout(() => doSearch(q, which), 300);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { const b = $('results').querySelector('button:not(:first-child)') || $('results').querySelector('button'); if (b) b.click(); }
    if (e.key === 'Escape') { hideResults(); input.blur(); }
  });
  input.addEventListener('blur', () => setTimeout(() => {
    if (document.activeElement !== $('inStart') && document.activeElement !== $('inDest')) {
      hideResults(); if (S[which]) input.value = S[which].label;
    }
  }, 150));
}
$('results').addEventListener('pointerdown', (e) => e.preventDefault()); // Fokus behalten
bindSearch('start'); bindSearch('dest');
document.querySelectorAll('.clear').forEach((b) => b.addEventListener('click', () => {
  const w = b.dataset.for; setPoint(w, null); clearRoute(); inputOf(w).focus();
}));
$('btnSwap').addEventListener('click', () => {
  const a = S.start, b = S.dest;
  if (!b) return;
  setPoint('start', null); setPoint('dest', null);
  setPoint('start', b); setPoint('dest', a && !a.isGps ? a : null);
  if (a && a.isGps) {
    // Ziel = aktueller Standort
    waitForFix().then((p) => { setPoint('dest', { lat: p.lat, lon: p.lon, label: 'Mein Standort (jetzt)' }); computeRoute(); }).catch((e) => toast(e.message));
  } else computeRoute();
});

map.on('click', (e) => {
  if (S.nav) return;
  if (!$('results').hidden) { hideResults(); document.activeElement && document.activeElement.blur(); return; }
  const ll = e.latlng;
  const div = document.createElement('div'); div.className = 'popbtns';
  div.innerHTML = '<button type="button" data-w="start">Start hier</button><button type="button" data-w="dest">Ziel hier</button>';
  div.addEventListener('click', (ev) => {
    const w = ev.target.dataset && ev.target.dataset.w; if (!w) return;
    map.closePopup();
    setPoint(w, { lat: ll.lat, lon: ll.lng, label: 'Kartenpunkt' });
    if (w === 'dest' && !S.start) setPoint('start', { isGps: true, label: 'Mein Standort' });
    reverseLabel(w); computeRoute();
  });
  L.popup({ closeButton: false, offset: [0, -4] }).setLatLng(ll).setContent(div).openOn(map);
});

// ------------------------------------------------------------------ GPS
let watchId = null, gpsDeniedShown = false;
function startWatch() {
  if (watchId !== null || !navigator.geolocation) return;
  watchId = navigator.geolocation.watchPosition(onPos, onPosErr, { enableHighAccuracy: true, maximumAge: 1000, timeout: 30000 });
}
function onPos(p) {
  const c = p.coords;
  const firstFix = !S.pos;
  S.pos = { lat: c.latitude, lon: c.longitude, acc: c.accuracy || 50, heading: c.heading, speed: c.speed, t: Date.now() };
  if (firstFix && !S.nav && !RG.bounds.contains([S.pos.lat, S.pos.lon])) {
    // automatisch ins Gebiet wechseln, in dem man sich gerade befindet
    const k = Object.keys(REGIONS).find((key) => REGIONS[key].bounds.contains([S.pos.lat, S.pos.lon]));
    if (k) { setRegion(k); toast('Gebiet gewechselt: ' + REGIONS[k].name); }
  }
  drawMe();
  if (S.nav) navUpdate();
}
let lastGpsErr = null;
function onPosErr(err) {
  lastGpsErr = err;
  if (err.code === 1) {
    // Erlaubnis verweigert: Watch beenden, damit ein neuer Versuch erneut fragen kann
    try { navigator.geolocation.clearWatch(watchId); } catch (e) { /* egal */ }
    watchId = null;
    if (!gpsDeniedShown) { gpsDeniedShown = true; toast(gpsErrText(err), 9000); }
  }
}
function gpsErrText(err) {
  if (!navigator.geolocation) return 'Dieses Gerät/dieser Browser bietet keine Ortung an.';
  if (!window.isSecureContext) return 'Ortung nur über https möglich.';
  if (err && err.code === 1) {
    const standalone = window.navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
    return standalone
      ? 'GPS gesperrt (Fehler 1): Im Vollbild-Modus blockiert dein iPhone die Ortung. Zum Navigieren bitte das RadNavi-Icon nehmen, das Safari öffnet.'
      : 'GPS gesperrt (Fehler 1). iPhone: Einstellungen → Apps → Safari → Standort → „Erlauben“.';
  }
  if (err && err.code === 2) return 'Standort nicht verfügbar (Fehler 2). Flugmodus aus, WLAN an oder kurz ans Fenster/nach draußen gehen.';
  return 'Noch kein GPS-Signal (Fehler 3). Kurz ans Fenster/nach draußen gehen und nochmal tippen.';
}
function waitForFix(ms = 20000) {
  lastGpsErr = null;
  startWatch();
  // zweiter Weg: einmalige, grobe Ortung (WLAN) – liefert unter iOS oft schneller und löst die Erlaubnis-Frage zuverlässig aus
  try { navigator.geolocation.getCurrentPosition(onPos, onPosErr, { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }); } catch (e) { /* egal */ }
  const fresh = () => S.pos && Date.now() - S.pos.t < 30000;
  if (fresh()) return Promise.resolve(S.pos);
  return new Promise((res, rej) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (fresh()) { clearInterval(iv); res(S.pos); }
      else if ((lastGpsErr && lastGpsErr.code === 1) || Date.now() - t0 > ms) { clearInterval(iv); rej(new Error(gpsErrText(lastGpsErr))); }
    }, 250);
  });
}
let meMarker = null, meAcc = null;
function drawMe() {
  const ll = [S.pos.lat, S.pos.lon];
  if (!meMarker) {
    meAcc = L.circle(ll, { radius: S.pos.acc, weight: 0, fillColor: '#2563eb', fillOpacity: 0.12, interactive: false }).addTo(map);
    meMarker = L.marker(ll, { icon: L.divIcon({ className: 'me', html: '<div class="me-h"></div><div class="me-dot"></div>', iconSize: [44, 44], iconAnchor: [22, 22] }), interactive: false, keyboard: false, zIndexOffset: 1000 }).addTo(map);
  } else { meMarker.setLatLng(ll); meAcc.setLatLng(ll).setRadius(S.pos.acc); }
  const el = meMarker.getElement(); const h = el && el.querySelector('.me-h');
  if (!h) return;
  let hd = S.pos.heading;
  if ((hd == null || isNaN(hd) || (S.pos.speed || 0) < 1) && S.nav && S.route) {
    const i = Math.min(S.nav.idx, S.route.pts.length - 2); hd = bearing(S.route.pts[i], S.route.pts[i + 1]);
  }
  if (hd != null && !isNaN(hd) && (S.nav || (S.pos.speed || 0) >= 1)) { h.style.display = 'block'; h.style.transform = `rotate(${hd}deg)`; }
  else h.style.display = 'none';
}
$('btnLocate').addEventListener('click', () => {
  toast('Suche deinen Standort …', 25000);
  waitForFix().then((p) => {
    toast('Standort gefunden ✔', 2000);
    map.setView([p.lat, p.lon], Math.max(map.getZoom(), 15));
    if (S.nav) { S.nav.follow = true; $('btnRecenter').hidden = true; }
  }).catch((e) => toast(e.message, 20000));
});
$('toast').addEventListener('click', () => { $('toast').hidden = true; });

// ------------------------------------------------------------------ Profil & Routing
let profileTpl = null;
const profileCache = {};
function profileKey() { return `${S.mode}|${Number(S.safety).toFixed(1)}|${S.hills}`; }
async function profileId(force) {
  const key = profileKey(), c = profileCache[key];
  if (!force && c && Date.now() - c.t < 3 * 3600e3) return c.id;
  if (!profileTpl) { const r = await fetch('profile.brf', { cache: 'no-cache' }); profileTpl = await r.text(); }
  const up = S.hills ? (S.mode === 'gravel' ? '60' : '40') : '0';
  const txt = profileTpl.split('%K%').join(Number(S.safety).toFixed(2))
    .split('%GRAVEL%').join(S.mode === 'gravel' ? 'true' : 'false')
    .split('%UPCOST%').join(up);
  const r = await fetch(BROUTER + '/profile', { method: 'POST', body: txt, headers: { 'Content-Type': 'text/plain' } });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  profileCache[key] = { id: j.profileid, t: Date.now() };
  return j.profileid;
}
async function fetchRoute(url) {
  const r = await fetch(url);
  const t = await r.text();
  if (!r.ok) { const e = new Error(t.trim().slice(0, 300)); e.noRoute = !/profile/i.test(t); throw e; }
  return JSON.parse(t);
}
function routeErrMsg(e) {
  const m = e.message || '';
  if (/not mapped/i.test(m)) return 'Start oder Ziel liegt zu weit von einem befahrbaren Weg entfernt.';
  if (/no track found|target island|unable/i.test(m)) return 'Keine Route gefunden. Anderen Punkt wählen oder „Direkter“ einstellen.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Keine Internetverbindung zum Routing-Server.';
  return 'Routing fehlgeschlagen: ' + m;
}

let routeSeq = 0;
async function computeRoute(opts = {}) {
  if (!S.dest) return null;
  const seq = ++routeSeq;
  $('loading').hidden = false;
  try {
    let from = S.start;
    if (!from || from.isGps) {
      const p = await waitForFix();
      from = { lat: p.lat, lon: p.lon, isGps: true, label: 'Mein Standort' };
    }
    if (!opts.keepAlt) S.alt = 0;
    const to = S.dest;
    if (hav(from, to) < 30) throw new Error('Start und Ziel liegen zu dicht beieinander.');
    const url = (id) => `${BROUTER}?lonlats=${from.lon.toFixed(6)},${from.lat.toFixed(6)}|${to.lon.toFixed(6)},${to.lat.toFixed(6)}&profile=${id}&alternativeidx=${S.alt}&format=geojson&timode=3`;
    let gj, fallback = false;
    try {
      gj = await fetchRoute(url(await profileId(false)));
    } catch (e1) {
      if (e1.noRoute) throw e1;
      try { gj = await fetchRoute(url(await profileId(true))); }
      catch (e2) {
        if (e2.noRoute) throw e2;
        gj = await fetchRoute(url('trekking'));
        fallback = true;
      }
    }
    if (seq !== routeSeq) return null;
    const R = parseRoute(gj);
    Object.assign(R, { from, to, fallback, mode: S.mode, alt: S.alt });
    S.route = R;
    drawRoute(R);
    renderSheet(R);
    if (!S.nav && !opts.noFit) map.fitBounds(R.bounds, fitPadding());
    return R;
  } catch (e) {
    if (seq === routeSeq) toast(e.noRoute === undefined && !/fetch|Network|Load failed/i.test(e.message) ? e.message : routeErrMsg(e), 6000);
    return null;
  } finally {
    if (seq === routeSeq) $('loading').hidden = true;
  }
}

// ------------------------------------------------------------------ Auswertung (Radweg-Prüfung)
function parseTags(s) {
  const o = {};
  for (const kv of (s || '').split(' ')) { const i = kv.indexOf('='); if (i > 0) o[kv.slice(0, i)] = kv.slice(i + 1); }
  return o;
}
function classify(t) {
  const hw = t.highway || '', bike = t.bicycle || '';
  const cw = [t.cycleway, t['cycleway:left'], t['cycleway:right'], t['cycleway:both']];
  if (t.route === 'ferry') return 'sonst';
  if (hw === 'steps') return 'schieben';
  if (t.bicycle_road === 'yes') return 'fstrasse';
  if (hw === 'cycleway' || bike === 'designated') return 'radweg';
  if (cw.some((v) => v === 'track' || v === 'opposite_track')) return 'cwtrack';
  if (cw.some((v) => v === 'lane' || v === 'opposite_lane')) return 'cwlane';
  if (['footway', 'pedestrian', 'corridor', 'platform'].includes(hw)) return (bike === 'yes' || bike === 'permissive') ? 'gehrad' : 'schieben';
  if (bike === 'dismount') return 'schieben';
  if (hw === 'track') return 'track';
  if (hw === 'path' || hw === 'bridleway') return (bike === 'yes' || bike === 'permissive') ? 'gehrad' : 'path';
  if (['residential', 'living_street', 'service'].includes(hw)) return 'ruhig';
  if (['unclassified', 'road', 'tertiary', 'tertiary_link'].includes(hw)) return 'strasse';
  if (['secondary', 'secondary_link', 'primary', 'primary_link', 'trunk', 'trunk_link', 'motorway', 'motorway_link'].includes(hw)) return 'haupt';
  return 'sonst';
}
function onRoute(t) { return ['icn', 'ncn', 'rcn', 'lcn'].some((k) => t['route_bicycle_' + k] === 'yes'); }

function parseRoute(gj) {
  const f = gj.features[0], p = f.properties;
  const pts = f.geometry.coordinates.map((c) => ({ lon: c[0], lat: c[1], ele: c.length > 2 ? c[2] : null }));
  const n = pts.length;
  const D = new Float64Array(n);
  for (let i = 1; i < n; i++) D[i] = D[i - 1] + hav(pts[i - 1], pts[i]);
  const total = D[n - 1];

  // Wegabschnitte aus den BRouter-Messages (je Zeile: Endpunkt in Mikrograd + OSM-Tags)
  const msgs = (p.messages || []).slice(1).map((r) => ({ lon: +r[0], lat: +r[1], dist: +r[3], tags: parseTags(r[9]) }));
  if (!msgs.length) msgs.push({ lon: 0, lat: 0, dist: total, tags: {} });
  const edgeMsg = new Int32Array(Math.max(1, n - 1));
  let m = 0, matched = 0;
  for (let i = 1; i < n; i++) {
    edgeMsg[i - 1] = Math.min(m, msgs.length - 1);
    const q = msgs[m];
    if (q && Math.round(pts[i].lon * 1e6) === q.lon && Math.round(pts[i].lat * 1e6) === q.lat) { m++; matched++; }
  }
  if (matched < msgs.length * 0.8) {
    // Rückfall: Zuordnung über die Distanzen
    const sum = msgs.reduce((a, q) => a + q.dist, 0) || 1;
    const ends = []; let acc = 0; for (const q of msgs) { acc += q.dist; ends.push(acc / sum * total); }
    let k = 0;
    for (let i = 0; i < n - 1; i++) { const mid = (D[i] + D[i + 1]) / 2; while (k < ends.length - 1 && mid > ends[k]) k++; edgeMsg[i] = k; }
  }
  const msgCat = msgs.map((q) => classify(q.tags));
  const edgeCat = Array.from(edgeMsg, (k) => msgCat[k]);

  // Läufe gleicher Kategorie
  const runs = [];
  for (let i = 0; i < n - 1; i++) {
    const c = edgeCat[i], last = runs[runs.length - 1];
    if (last && last.cat === c) { last.i1 = i + 1; }
    else runs.push({ cat: c, i0: i, i1: i + 1 });
  }
  const catLen = {}; CAT_ORDER.forEach((c) => { catLen[c] = 0; });
  let routeLen = 0;
  for (const r of runs) {
    r.from = D[r.i0]; r.to = D[r.i1]; r.len = r.to - r.from;
    catLen[r.cat] += r.len;
    const hwCount = {};
    for (let i = r.i0; i < r.i1; i++) { const hw = msgs[edgeMsg[i]].tags.highway || ''; hwCount[hw] = (hwCount[hw] || 0) + (D[i + 1] - D[i]); }
    r.hw = Object.keys(hwCount).sort((a, b) => hwCount[b] - hwCount[a])[0] || '';
  }
  for (let i = 0; i < n - 1; i++) if (onRoute(msgs[edgeMsg[i]].tags)) routeLen += D[i + 1] - D[i];

  const verifiedLen = CAT_ORDER.filter((c) => CATS[c].verified).reduce((a, c) => a + catLen[c], 0);
  const ascend = +p['filtered ascend'] || 0;
  const time = total / ((S.mode === 'gravel' ? 20 : 15) / 3.6) + ascend * (S.mode === 'gravel' ? 7 : 9);

  const R = { pts, D, total, msgs, edgeMsg, edgeCat, runs, catLen, verifiedLen, routeLen, ascend, time,
    bounds: L.latLngBounds(pts.map((q) => [q.lat, q.lon])) };
  R.instr = buildInstructions(R, p.voicehints || []);
  return R;
}

// ------------------------------------------------------------------ Abbiegehinweise
function turnWords(angle, exit, cmd) {
  if (exit > 0) return { short: `Kreisverkehr: ${exit}. Ausfahrt`, say: `Im Kreisverkehr die ${['', 'erste', 'zweite', 'dritte', 'vierte', 'fünfte', 'sechste'][exit] || exit + '.'} Ausfahrt nehmen`, icon: 'rb' };
  const a = Math.abs(angle), side = angle < 0 ? 'links' : 'rechts';
  if (a < 15) {
    if (cmd === 8) return { short: 'Links halten', say: 'links halten', icon: -20 };
    if (cmd === 9) return { short: 'Rechts halten', say: 'rechts halten', icon: 20 };
    return null;
  }
  if (a < 45) return { short: `Leicht ${side}`, say: `leicht ${side} abbiegen`, icon: angle };
  if (a < 125) return { short: `${side[0].toUpperCase() + side.slice(1)} abbiegen`, say: `${side} abbiegen`, icon: angle };
  if (a < 165) return { short: `Scharf ${side}`, say: `scharf ${side} abbiegen`, icon: angle };
  return { short: 'Wenden', say: 'wenden', icon: 'u' };
}
function buildInstructions(R, hints) {
  const out = [];
  const n = R.pts.length;
  for (const h of hints) {
    const idx = h[0], cmd = h[1], exit = h[2], angle = h[4];
    if (idx <= 0 || idx >= n - 1) continue;
    const w = turnWords(angle, exit, cmd);
    if (!w) continue;
    const catAfter = R.edgeCat[idx], catBefore = R.edgeCat[idx - 1];
    const onto = catAfter !== catBefore && CATS[catAfter].onto ? CATS[catAfter].onto : '';
    out.push({ d: R.D[idx], idx, icon: w.icon, text: w.short, sub: onto ? onto.replace(/\. .*$/, '') : CATS[catAfter].label,
      say: w.say[0].toUpperCase() + w.say.slice(1) + (onto ? ', ' + onto : ''), sayLower: w.say + (onto ? ', ' + onto : ''), cat: catAfter });
  }
  // Sicherheitswarnungen beim Wechsel auf Abschnitte mit Autoverkehr / Schiebestrecken
  for (const r of R.runs) {
    const c = CATS[r.cat];
    if (!c.warn) continue;
    if (r.cat === 'schieben' ? r.len < 15 : r.len < 120) continue;
    if (r.from < 5) continue;
    const near = out.find((o) => Math.abs(o.d - r.from) < 30);
    const what = r.cat === 'schieben' ? `${fmtKm(r.len)} schieben` : `${fmtKm(r.len)} ${RG.hw[r.hw] || 'Straße'} mit Autoverkehr`;
    if (near) { near.warn = what; near.sub = '⚠ ' + what; continue; }
    out.push({ d: r.from, idx: r.i0, icon: 'warn', text: r.cat === 'schieben' ? 'Absteigen' : 'Achtung', sub: what, warn: what,
      say: r.cat === 'schieben' ? `Bitte absteigen und ${Math.round(r.len)} Meter schieben` : `Achtung: ${sayDist(r.len).replace('Metern', 'Meter').replace('Kilometern', 'Kilometer')} ${RG.hw[r.hw] || 'Straße'} mit Autoverkehr`,
      sayLower: r.cat === 'schieben' ? 'absteigen und schieben' : `beginnt ein Abschnitt mit Autoverkehr`, cat: r.cat });
  }
  out.sort((a, b) => a.d - b.d);
  out.push({ d: R.total, idx: n - 1, icon: 'flag', text: 'Ziel erreicht', sub: S.dest ? S.dest.label : '', say: 'Sie haben Ihr Ziel erreicht', sayLower: 'erreichen Sie Ihr Ziel', cat: 'sonst', arrive: true });
  return out;
}

// ------------------------------------------------------------------ Zeichnen
let routeLayer = null, elevMarker = null;
function clearRoute() {
  if (routeLayer) { map.removeLayer(routeLayer); routeLayer = null; }
  if (elevMarker) { map.removeLayer(elevMarker); elevMarker = null; }
  S.route = null; $('routeSheet').hidden = true; updateInsets();
}
function drawRoute(R) {
  if (routeLayer) map.removeLayer(routeLayer);
  routeLayer = L.layerGroup().addTo(map);
  L.polyline(R.pts.map((q) => [q.lat, q.lon]), { color: '#ffffff', weight: 10, opacity: 0.95, interactive: false }).addTo(routeLayer);
  for (const r of R.runs) {
    const ll = []; for (let i = r.i0; i <= r.i1; i++) ll.push([R.pts[i].lat, R.pts[i].lon]);
    const pl = L.polyline(ll, { color: CATS[r.cat].color, weight: 6, opacity: 1, bubblingMouseEvents: false }).addTo(routeLayer);
    pl.on('click', (e) => showSegInfo(R, e.latlng, r));
  }
}
function showSegInfo(R, ll, run) {
  const p = { lat: ll.lat, lon: ll.lng };
  let best = run.i0, bd = Infinity;
  for (let i = run.i0; i < run.i1; i++) { const d = projSeg(p, R.pts[i], R.pts[i + 1]).d; if (d < bd) { bd = d; best = i; } }
  const t = R.msgs[R.edgeMsg[best]].tags, c = CATS[run.cat];
  const tagStr = Object.keys(t).filter((k) => k !== 'reversedirection').map((k) => `${k}=${t[k]}`).join(', ');
  const verdict = c.verified ? '✔ eindeutig als Radverkehrsanlage eingetragen'
    : run.cat === 'gehrad' ? 'Kein offizieller Radweg, aber autofrei – Radfahren erlaubt (Rücksicht auf Fußgänger)'
    : c.warn ? '⚠ kein Radweg – gemeinsam mit Autoverkehr' : 'kein ausgewiesener Radweg, aber ohne Durchgangsverkehr';
  L.popup({ maxWidth: 260 }).setLatLng(ll).setContent(
    `<div class="seginfo"><b>${esc(c.label)}</b><br>${esc(verdict)}<br>Abschnitt: ${fmtKm(run.len)}${onRoute(t) ? '<br>Teil einer beschilderten Radroute' : ''}<br><code>OSM: ${esc(tagStr || '–')}</code></div>`
  ).openOn(map);
}

function renderSheet(R) {
  const sh = $('routeSheet');
  if (sh.hidden) { sh.classList.add('collapsed'); $('moreHint').textContent = 'Details ▾'; }
  sh.hidden = false;
  $('sDist').textContent = fmtKm(R.total);
  $('sTime').textContent = fmtDur(R.time);
  $('sUp').textContent = nf0.format(R.ascend) + ' m';
  const carFree = ['radweg', 'cwtrack', 'gehrad', 'track', 'path'].reduce((a, c) => a + R.catLen[c], 0);
  $('sVerified').textContent = `${pct(carFree / R.total)} autofrei · ${pct(R.verifiedLen / R.total)} Radweg`;
  $('btnAlt').textContent = R.alt ? `Alternative ${R.alt + 1}/4` : 'Alternative';

  const bar = $('catBar'), leg = $('catLegend'); bar.innerHTML = ''; leg.innerHTML = '';
  for (const c of CAT_ORDER) {
    const len = R.catLen[c]; if (len < 1) continue;
    const s = document.createElement('span'); s.style.flex = String(len); s.style.background = CATS[c].color; s.title = CATS[c].label; bar.appendChild(s);
    const li = document.createElement('li');
    li.innerHTML = `<i style="background:${CATS[c].color}"></i><span class="name">${esc(CATS[c].label)}</span><span class="val">${fmtKm(len)}</span>`;
    leg.appendChild(li);
  }

  const w = $('warnings'); w.innerHTML = '';
  const items = R.runs.filter((r) => CATS[r.cat].warn && (r.cat === 'schieben' ? r.len >= 15 : r.len >= 100));
  for (const r of items) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'warn';
    const what = r.cat === 'schieben' ? `${fmtKm(r.len)} schieben (Treppe/Gehweg)` : `${fmtKm(r.len)} ${RG.hw[r.hw] || 'Straße'} ohne Radweg`;
    b.innerHTML = `<i>!</i><span>${esc(what)} – bei km ${nf1.format(r.from / 1000)}</span>`;
    b.addEventListener('click', () => {
      const ll = []; for (let i = r.i0; i <= r.i1; i++) ll.push([R.pts[i].lat, R.pts[i].lon]);
      toggleSheet(true);
      map.fitBounds(L.latLngBounds(ll), { ...fitPadding(), maxZoom: 17 });
    });
    w.appendChild(b);
  }
  if (!items.length) {
    const d = document.createElement('div'); d.className = 'warn ok';
    d.innerHTML = '<i>✔</i><span>Keine längeren Abschnitte auf Straßen mit Autoverkehr.</span>'; w.appendChild(d);
  }

  const notes = [];
  if (R.routeLen > 50) notes.push(`${fmtKm(R.routeLen)} verlaufen auf beschilderten Radrouten.`);
  notes.push('Linie antippen zeigt die OSM-Merkmale des Abschnitts.');
  const note = $('routeNote');
  note.className = 'small';
  if (R.fallback) { note.className = 'small alert'; notes.unshift('Sicherheitsprofil gerade nicht verfügbar – Ersatzprofil des Servers verwendet.'); }
  if (!RG.bounds.contains([R.to.lat, R.to.lon]) || !RG.bounds.contains([R.from.lat, R.from.lon])) notes.unshift('Hinweis: Start oder Ziel liegt außerhalb des Gebiets ' + RG.area + '.');
  note.textContent = notes.join(' ');
  updateInsets();
  requestAnimationFrame(() => drawElevation(R));
}

// ------------------------------------------------------------------ Höhenprofil
let elevCursor = null;
function drawElevation(R) {
  const cv = $('elev');
  if (!R || $('routeSheet').hidden || $('routeSheet').classList.contains('collapsed')) return;
  const w = cv.clientWidth, h = cv.clientHeight; if (!w) return;
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
  const E = R.pts.map((q) => q.ele);
  if (E.some((v) => v == null)) { $('elevInfo').textContent = 'keine Höhendaten'; return; }
  let mn = Infinity, mx = -Infinity; for (const v of E) { if (v < mn) mn = v; if (v > mx) mx = v; }
  const lo = mn, hi = mx, pad = Math.max(8, (mx - mn) * 0.12); mn -= pad; mx += pad;
  const css = getComputedStyle(document.documentElement);
  const Lx = 36, B = 16, T = 4, W = w - Lx - 4, H = h - B - T;
  const X = (d) => Lx + d / R.total * W, Y = (e) => T + H - (e - mn) / (mx - mn) * H;
  c.beginPath(); c.moveTo(X(0), T + H);
  for (let i = 0; i < E.length; i++) c.lineTo(X(R.D[i]), Y(E[i]));
  c.lineTo(X(R.total), T + H); c.closePath(); c.fillStyle = css.getPropertyValue('--elev-fill').trim(); c.fill();
  c.lineWidth = 2.5; c.lineJoin = 'round';
  for (const r of R.runs) {
    c.beginPath(); c.moveTo(X(R.D[r.i0]), Y(E[r.i0]));
    for (let i = r.i0 + 1; i <= r.i1; i++) c.lineTo(X(R.D[i]), Y(E[i]));
    c.strokeStyle = CATS[r.cat].color; c.stroke();
  }
  c.fillStyle = css.getPropertyValue('--muted').trim(); c.font = '10px -apple-system, system-ui, sans-serif';
  c.textAlign = 'right'; c.fillText(Math.round(hi) + ' m', Lx - 4, Y(hi) + 4); c.fillText(Math.round(lo) + ' m', Lx - 4, Y(lo) + 2);
  const steps = [1, 2, 5, 10, 20, 25, 50]; const km = R.total / 1000; const st = steps.find((s) => km / s <= 6) || 100;
  c.textAlign = 'center';
  for (let k = 0; k <= km + 1e-9; k += st) c.fillText(k + (k === 0 ? ' km' : ''), X(k * 1000), h - 3);
  if (elevCursor != null) {
    const i = idxAtDist(R.D, elevCursor);
    c.strokeStyle = css.getPropertyValue('--fg').trim(); c.lineWidth = 1;
    c.beginPath(); c.moveTo(X(elevCursor), T); c.lineTo(X(elevCursor), T + H); c.stroke();
    c.beginPath(); c.arc(X(R.D[i]), Y(E[i]), 3.5, 0, Math.PI * 2); c.fillStyle = css.getPropertyValue('--fg').trim(); c.fill();
  }
  if (elevCursor == null) $('elevInfo').textContent = `${Math.round(lo)}–${Math.round(hi)} m · ↑ ${nf0.format(R.ascend)} m`;
}
function elevPointer(e) {
  const R = S.route; if (!R) return;
  const cv = $('elev'), rect = cv.getBoundingClientRect();
  const W = rect.width - 36 - 4;
  const d = Math.max(0, Math.min(R.total, (e.clientX - rect.left - 36) / W * R.total));
  elevCursor = d;
  const i = idxAtDist(R.D, d), p = R.pts[i];
  $('elevInfo').textContent = `km ${nf1.format(d / 1000)} · ${Math.round(p.ele || 0)} m · ${CATS[R.edgeCat[Math.min(i, R.edgeCat.length - 1)]].label}`;
  if (!elevMarker) elevMarker = L.circleMarker([p.lat, p.lon], { radius: 7, color: '#111827', weight: 3, fillColor: '#fff', fillOpacity: 1, interactive: false }).addTo(map);
  else elevMarker.setLatLng([p.lat, p.lon]);
  drawElevation(R);
}
$('elev').addEventListener('pointerdown', (e) => { $('elev').setPointerCapture(e.pointerId); elevPointer(e); });
$('elev').addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'mouse') elevPointer(e); });
$('elev').addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { elevCursor = null; if (elevMarker) { map.removeLayer(elevMarker); elevMarker = null; } drawElevation(S.route); } });
window.addEventListener('resize', () => { updateInsets(); drawElevation(S.route); });

function toggleSheet(force) {
  const sh = $('routeSheet');
  const collapsed = sh.classList.toggle('collapsed', force);
  $('moreHint').textContent = collapsed ? 'Details ▾' : 'weniger ▴';
  updateInsets(); drawElevation(S.route);
}
$('btnGrab').addEventListener('click', () => toggleSheet());
$('btnVerify').addEventListener('click', () => toggleSheet());
$('btnAlt').addEventListener('click', () => { S.alt = (S.alt + 1) % 4; computeRoute({ keepAlt: true }); });

// ------------------------------------------------------------------ GPX
function buildGpx(R) {
  const name = `RadNavi ${RG.name} ${R.mode === 'gravel' ? 'Gravel' : 'MTB'}: ${R.from.label} – ${R.to.label}`;
  const pts = R.pts.map((q) => `<trkpt lat="${q.lat.toFixed(6)}" lon="${q.lon.toFixed(6)}">${q.ele != null ? `<ele>${q.ele}</ele>` : ''}</trkpt>`).join('\n');
  const wpts = R.instr.filter((i) => i.warn).map((i) => { const q = R.pts[i.idx]; return `<wpt lat="${q.lat.toFixed(6)}" lon="${q.lon.toFixed(6)}"><name>${esc(i.text)}</name><desc>${esc(i.warn)}</desc></wpt>`; }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="RadNavi Rur-Eifel" xmlns="http://www.topografix.com/GPX/1/1">
<metadata><name>${esc(name)}</name><time>${new Date().toISOString()}</time></metadata>
${wpts}
<trk><name>${esc(name)}</name><type>${R.mode === 'gravel' ? 'gravel_cycling' : 'mountain_biking'}</type><trkseg>
${pts}
</trkseg></trk>
</gpx>`;
}
$('btnGpx').addEventListener('click', async () => {
  const R = S.route; if (!R) return;
  const fname = `radnavi-${R.mode}-${new Date().toISOString().slice(0, 10)}.gpx`;
  const file = new File([buildGpx(R)], fname, { type: 'application/gpx+xml' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'RadNavi-Route' }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = fname;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
});

// ------------------------------------------------------------------ Sprache
let voiceDe = null;
function pickVoice() {
  const vs = window.speechSynthesis ? speechSynthesis.getVoices() : [];
  voiceDe = vs.find((v) => v.lang === 'de-DE' && /Anna|Helena|Petra|Markus|Yannick|Siri/i.test(v.name)) || vs.find((v) => /^de/i.test(v.lang)) || null;
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.addEventListener && speechSynthesis.addEventListener('voiceschanged', pickVoice); }
function speak(text) {
  if (!S.voice || !('speechSynthesis' in window) || !text) return;
  try {
    // nur abbrechen, wenn wirklich gerade gesprochen wird – ein cancel() direkt vor speak() verschluckt unter iOS die Ansage
    if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
    if (!voiceDe) pickVoice();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'de-DE'; if (voiceDe) u.voice = voiceDe; u.rate = 1.0;
    speechSynthesis.speak(u);
  } catch (e) { /* ohne Ton weiter */ }
}
function unlockSpeech() {
  try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; u.lang = 'de-DE'; speechSynthesis.speak(u); } catch (e) { /* egal */ }
}

// ------------------------------------------------------------------ Navigation
let wake = null;
async function requestWake() { try { if ('wakeLock' in navigator) wake = await navigator.wakeLock.request('screen'); } catch (e) { wake = null; } }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.nav) requestWake(); });

function arrowSvg(icon) {
  const wrap = (inner) => `<svg viewBox="0 0 64 64">${inner}</svg>`;
  if (icon === 'flag') return wrap('<path d="M18 58V8M18 10h30l-7 9 7 9H18" fill="#fff" stroke="#fff" stroke-width="4" stroke-linejoin="round"/>');
  if (icon === 'warn') return wrap('<path d="M32 6 60 56H4z" fill="#fde047"/><path d="M32 24v16" stroke="#111" stroke-width="6" stroke-linecap="round"/><circle cx="32" cy="48" r="3.5" fill="#111"/>');
  if (icon === 'rb') return wrap('<circle cx="32" cy="34" r="12" fill="none" stroke="#fff" stroke-width="6"/><path d="M32 58V46M44 34h12M52 28l6 6-6 6" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>');
  if (icon === 'u') return wrap('<path d="M40 58V26a10 10 0 0 0-20 0v14" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M12 34l8 9 8-9" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>');
  const a = Math.max(-150, Math.min(150, Number(icon) || 0));
  return wrap(`<g transform="rotate(${a} 32 36)"><path d="M32 60V14" stroke="#fff" stroke-width="8" stroke-linecap="round"/><path d="M18 26 32 10l14 16" stroke="#fff" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>`);
}

function startNav() {
  if (!S.route) return;
  S.nav = { idx: 0, s: 0, nextI: 0, annFar: -1, annNear: -1, off: 0, found: false, lastReroute: 0, follow: true, done: false, rerouting: false };
  $('planner').hidden = true; $('routeSheet').hidden = true; hideResults(); map.closePopup();
  $('navTop').hidden = false; $('navBottom').hidden = false;
  if (elevMarker) { map.removeLayer(elevMarker); elevMarker = null; }
  updateInsets();
  requestWake();
  startWatch();
  const first = S.route.instr[0];
  $('navArrow').innerHTML = arrowSvg(0); $('navDist').textContent = 'GPS …'; $('navText').textContent = 'Warte auf Standort'; $('navSub').textContent = '';
  speak(`Navigation gestartet. ${fmtKm(S.route.total).replace(' km', ' Kilometer').replace(' m', ' Meter')}. ${first && !first.arrive ? 'Danach ' + first.sayLower + '.' : ''}`);
  if (S.pos) navUpdate();
  map.setZoom(Math.max(map.getZoom(), 16));
}
function stopNav() {
  S.nav = null;
  try { if (wake) wake.release(); } catch (e) { /* egal */ } wake = null;
  try { speechSynthesis.cancel(); } catch (e) { /* egal */ }
  $('navTop').hidden = true; $('navBottom').hidden = true; $('btnRecenter').hidden = true;
  $('planner').hidden = false;
  if (S.route) { $('routeSheet').hidden = false; renderSheet(S.route); }
  updateInsets();
}
$('btnNav').addEventListener('click', startNav);
$('btnStop').addEventListener('click', stopNav);
map.on('dragstart', () => { if (S.nav) { S.nav.follow = false; $('btnRecenter').hidden = false; } });
$('btnRecenter').addEventListener('click', () => {
  if (!S.nav) return; S.nav.follow = true; $('btnRecenter').hidden = true;
  if (S.pos) map.setView([S.pos.lat, S.pos.lon], Math.max(map.getZoom(), 16));
});

async function reroute() {
  const N = S.nav; if (!N || N.rerouting) return;
  N.rerouting = true; N.lastReroute = Date.now();
  speak('Sie haben die Route verlassen. Neue Route wird berechnet.');
  $('navText').textContent = 'Neue Route wird berechnet …';
  setPoint('start', { isGps: true, label: 'Mein Standort' });
  const R = await computeRoute({ noFit: true });
  if (S.nav) {
    S.nav.rerouting = false;
    if (R) Object.assign(S.nav, { idx: 0, s: 0, nextI: 0, annFar: -1, annNear: -1, off: 0, found: false });
    $('routeSheet').hidden = true; updateInsets();
    navUpdate();
  }
}

function navUpdate() {
  const N = S.nav, R = S.route, P = S.pos;
  if (!N || !R || !P || N.rerouting) return;
  const n = R.pts.length;
  // Position auf der Route suchen (zuerst in der Nähe des letzten Treffers)
  const search = (lo, hi) => { let b = { d: Infinity, i: 0, t: 0 }; for (let i = lo; i <= hi; i++) { const pr = projSeg(P, R.pts[i], R.pts[i + 1]); if (pr.d < b.d) b = { d: pr.d, i, t: pr.t }; } return b; };
  let best = N.found ? search(Math.max(0, N.idx - 15), Math.min(n - 2, N.idx + 500)) : search(0, n - 2);
  if (N.found && best.d > 60) { const g = search(0, n - 2); if (g.d < best.d) best = g; }
  const thresh = Math.max(35, Math.min(P.acc, 60) + 15);
  if (best.d > thresh && P.acc < 80) N.off++; else if (best.d <= thresh) N.off = 0;

  if (best.d <= thresh) {
    const s = R.D[best.i] + best.t * (R.D[best.i + 1] - R.D[best.i]);
    if (!N.found || s > N.s - 40) { N.s = s; N.idx = best.i; }
    N.found = true;
  }
  if (N.off >= 3 && !N.done && Date.now() - N.lastReroute > 20000) { reroute(); return; }

  const remain = Math.max(0, R.total - N.s);
  while (N.nextI < R.instr.length - 1 && R.instr[N.nextI].d < N.s + 6) N.nextI++;
  const ins = R.instr[N.nextI];
  const dist = Math.max(0, ins.d - N.s);
  const off = best.d > thresh;

  // Anzeige
  $('navTop').classList.toggle('alert', !!(ins.warn && dist < 300) || off);
  if (!N.found) {
    $('navArrow').innerHTML = arrowSvg('warn'); $('navDist').textContent = fmtDist(best.d);
    $('navText').textContent = 'Zur Route fahren'; $('navSub').textContent = 'Route beginnt in ' + fmtDist(best.d);
  } else if (off) {
    $('navArrow').innerHTML = arrowSvg('warn'); $('navDist').textContent = fmtDist(best.d);
    $('navText').textContent = 'Abseits der Route'; $('navSub').textContent = 'Neuberechnung folgt …';
  } else {
    $('navArrow').innerHTML = arrowSvg(ins.icon);
    $('navDist').textContent = fmtDist(dist);
    $('navText').textContent = ins.text;
    $('navSub').textContent = ins.sub || '';
  }
  $('navRemain').textContent = fmtKm(remain);
  const v = P.speed != null && P.speed >= 0 ? P.speed : null;
  $('navSpeed').textContent = v != null ? nf0.format(v * 3.6) : '–';
  const frac = R.total ? remain / R.total : 0;
  const eta = new Date(Date.now() + R.time * frac * 1000);
  $('navEta').textContent = eta.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

  // Ansagen
  if (N.found && !off && !N.done) {
    const vs = Math.max(v || 0, 4);
    const near = Math.max(30, vs * 6);
    const far = Math.max(200, vs * 22);
    if (ins.arrive && remain < 25) {
      N.done = true; speak(ins.say);
      $('navArrow').innerHTML = arrowSvg('flag'); $('navDist').textContent = 'Ziel'; $('navText').textContent = 'Ziel erreicht';
    } else if (N.annNear !== N.nextI && dist <= near) {
      N.annNear = N.nextI; N.annFar = N.nextI;
      if (!ins.arrive) speak(ins.say);
      const after = R.instr[N.nextI + 1];
      if (after && !after.arrive && after.d - ins.d < 60 && after.d - ins.d > 0) setTimeout(() => speak('Danach ' + after.sayLower), 2200);
    } else if (N.annFar !== N.nextI && dist <= far && dist > near + 50) {
      N.annFar = N.nextI;
      speak(`In ${sayDist(dist)} ${ins.sayLower}`);
    }
  }
  if (N.follow) map.setView([P.lat, P.lon], Math.max(map.getZoom(), 15), { animate: true, duration: 0.5 });
}

// ------------------------------------------------------------------ Einstellungen
function syncModeButtons() { document.querySelectorAll('.mode').forEach((b) => b.classList.toggle('active', b.dataset.mode === S.mode)); }
document.querySelectorAll('.mode').forEach((b) => b.addEventListener('click', () => {
  if (S.mode === b.dataset.mode) return;
  S.mode = b.dataset.mode; store.set('mode', S.mode); syncModeButtons();
  if (S.mode === 'mtb' && S.layer === 'cyclosm') { /* CyclOSM zeigt auch Trails */ }
  computeRoute();
}));
syncModeButtons();

const rg = $('rgSafety');
function safetyLabel(v) { return v <= 0.6 ? 'sehr direkt' : v <= 0.9 ? 'direkt' : v <= 1.2 ? 'ausgewogen' : v <= 1.4 ? 'sicher' : 'maximal sicher'; }
rg.value = S.safety; $('safetyVal').textContent = safetyLabel(S.safety);
rg.addEventListener('input', () => { $('safetyVal').textContent = safetyLabel(+rg.value); });
$('cbHills').checked = S.hills; $('cbVoice').checked = S.voice;
let settingsDirty = false;
rg.addEventListener('change', () => { S.safety = +rg.value; store.set('safety', S.safety); settingsDirty = true; });
$('cbHills').addEventListener('change', (e) => { S.hills = e.target.checked; store.set('hills', S.hills); settingsDirty = true; });
$('cbVoice').addEventListener('change', (e) => { S.voice = e.target.checked; store.set('voice', S.voice); if (S.voice) speak('Sprachansagen sind an.'); });
$('btnVoiceTest').addEventListener('click', () => {
  if (!('speechSynthesis' in window)) { toast('Dieser Browser hat keine Sprachausgabe.'); return; }
  const was = S.voice; S.voice = true;
  speak('Hallo! Die Sprachansagen von RadNavi funktionieren.');
  S.voice = was;
  toast('Nichts zu hören? Lautstärke hoch und Stummschalter am iPhone aus.', 6000);
});
document.querySelectorAll('#layerSeg button').forEach((b) => b.addEventListener('click', () => setLayer(b.dataset.layer)));

function setRegion(key) {
  if (!REGIONS[key]) return;
  const changed = key !== S.region;
  S.region = key; store.set('region', key); RG = REGIONS[key];
  document.querySelectorAll('#regionSeg button').forEach((b) => b.classList.toggle('active', b.dataset.region === key));
  $('inDest').placeholder = key === 'mallorca' ? 'Wohin auf Mallorca?' : key === 'austria' ? 'Wohin in Österreich?' : 'Wohin?';
  if (!changed) return;
  if (S.start && !S.start.isGps) setPoint('start', null);
  setPoint('dest', null);
  clearRoute();
  map.setMaxBounds(null);
  map.setView(RG.home, RG.zoom);
  map.setMaxBounds(RG.bounds.pad(0.1));
}
document.querySelectorAll('#regionSeg button').forEach((b) => b.addEventListener('click', () => { setRegion(b.dataset.region); closeSettings(); }));
setRegion(S.region);
function openSettings() { settingsDirty = false; $('settings').hidden = false; $('settingsBack').hidden = false; }
function closeSettings() {
  $('settings').hidden = true; $('settingsBack').hidden = true;
  if (settingsDirty && S.dest) computeRoute();
}
$('btnSettings').addEventListener('click', openSettings);
$('btnCloseSettings').addEventListener('click', closeSettings);
$('settingsBack').addEventListener('click', closeSettings);

// ------------------------------------------------------------------ Start
updateInsets();
if (navigator.permissions && navigator.permissions.query) {
  navigator.permissions.query({ name: 'geolocation' }).then((st) => { if (st.state === 'granted') startWatch(); }).catch(() => {});
}
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
// zum Testen: window.RadNavi
window.RadNavi = { S, map, classify, parseRoute, computeRoute, setPoint, startNav, stopNav, navUpdate, onPos };
})();
