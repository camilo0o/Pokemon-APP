// index.js - Vanilla Pokédex con extras: filtro en vivo, skeletons, dark-mode
// -------------------------------------------------
// Recomendación: si abrís por file:// y tenés problemas, serví con:
// python -m http.server 8000
// -------------------------------------------------

const API_BASE = 'https://pokeapi.co/api/v2';
const ARTWORK = id => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;

/* -------------------------
   DOM elements
   ------------------------- */
const searchInput    = document.getElementById('searchInput');
const searchBtn      = document.getElementById('searchBtn');
const detailEl       = document.getElementById('detail');
const listEl         = document.getElementById('list');
const pagination     = document.getElementById('pagination');
const recentList     = document.getElementById('recentList');
const favoritesList  = document.getElementById('favoritesList');
const perPageSel     = document.getElementById('perPage');
const filterInput    = document.getElementById('filterInput');
const themeToggle    = document.getElementById('themeToggle');

/* -------------------------
   Storage keys & state
   ------------------------- */
const CACHE_KEY = 'pkdx_cache_v1';
const RECENT_KEY = 'pkdx_recent_v1';
const FAV_KEY = 'pkdx_fav_v1';
const THEME_KEY = 'pkdx_theme_v1';
const PERPAGE_KEY = 'pkdx_perpage_v1';

const DETAIL_CACHE_MS = 1000 * 60 * 60 * 24; // 24h
const LIST_CACHE_MS   = 1000 * 60 * 10;      // 10m

let state = {
  page: 1,
  perPage: parseInt(localStorage.getItem(PERPAGE_KEY) || perPageSel?.value || '24', 10),
  total: 0,
  currentList: [], // datos de la página actual (para filtro client-side)
  filterText: '',
};

/* -------------------------
   Small utils (pure, testable)
   ------------------------- */
function idFromUrl(url){
  const parts = (url || '').split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}
function debounce(fn, wait = 300){
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

/* -------------------------
   Cache helpers
   ------------------------- */
function _readCache(){ try{ return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') } catch(e){ return {} } }
function _writeCache(obj){ localStorage.setItem(CACHE_KEY, JSON.stringify(obj)); }
function cachePut(key, data){ const c = _readCache(); c[key] = { data, savedAt: Date.now() }; _writeCache(c); }
function cacheGet(key, maxAge = DETAIL_CACHE_MS){ const c = _readCache(); const entry = c[key]; if(!entry) return null; if(maxAge !== Infinity && (Date.now() - entry.savedAt > maxAge)) return null; return entry.data; }

/* -------------------------
   Recent & Fav
   ------------------------- */
function readJSON(key, def = []){ try{ return JSON.parse(localStorage.getItem(key)) || def } catch(e){ return def } }
function writeJSON(key, val){ localStorage.setItem(key, JSON.stringify(val)); }

function pushRecent(name){
  if(!name) return;
  name = String(name).toLowerCase();
  let arr = readJSON(RECENT_KEY, []);
  if(arr[0] === name) return;
  arr = arr.filter(n => n !== name);
  arr.unshift(name);
  if(arr.length > 10) arr.length = 10;
  writeJSON(RECENT_KEY, arr);
  renderRecent();
}

function toggleFavorite(name){
  name = String(name).toLowerCase();
  let fav = readJSON(FAV_KEY, []);
  if(fav.includes(name)) fav = fav.filter(n => n !== name);
  else {
    fav.unshift(name);
    if(fav.length > 50) fav.length = 50;
  }
  writeJSON(FAV_KEY, fav);
  renderFavorites();
}

function isFavorite(name){
  const fav = readJSON(FAV_KEY, []);
  return fav.includes(String(name).toLowerCase());
}

/* -------------------------
   Render lateral lists
   ------------------------- */
function renderRecent(){
  const arr = readJSON(RECENT_KEY, []);
  if(arr.length === 0){ recentList.innerHTML = '<li class="muted">(vacío)</li>'; return; }
  recentList.innerHTML = arr.map(n => `<li data-name="${n}" tabindex="0">${n}</li>`).join('');
}
function renderFavorites(){
  const arr = readJSON(FAV_KEY, []);
  if(arr.length === 0){ favoritesList.innerHTML = '<li class="muted">(vacío)</li>'; return; }
  favoritesList.innerHTML = arr.map(n => `<li data-name="${n}" tabindex="0">${n}</li>`).join('');
}

/* -------------------------
   Skeleton helpers (UI)
   ------------------------- */
function showListSkeleton(count = 8){
  const skeletons = new Array(count).fill(0).map(()=>`<div class="skeleton-card"></div>`).join('');
  // Wrap skeletons into grid cells similar size
  listEl.innerHTML = skeletons;
}
function showDetailSkeleton(){ detailEl.innerHTML = `<div class="skeleton-detail"></div>`; }

/* -------------------------
   Fetch improved
   ------------------------- */
async function fetchPokemon(nameOrId, { retries = 2, retryDelay = 700 } = {}) {
  const key = `pokemon_${String(nameOrId).toLowerCase()}`;
  const cached = cacheGet(key, DETAIL_CACHE_MS);

  try {
    const normalized = String(nameOrId).trim().toLowerCase();
    const url = `${API_BASE}/pokemon/${encodeURIComponent(normalized)}`;
    const res = await fetch(url);

    if (res.ok) {
      const data = await res.json();
      try { cachePut(key, data); } catch(e){ console.warn('cachePut failed', e); }
      return { data, fromCache: false };
    }

    const status = res.status;
    let msg = `HTTP ${status}`;
    try { const json = await res.json(); if (json && (json.detail || json.message)) msg = json.detail || json.message; } catch(e){}

    if ((status === 429 || (status >= 500 && status < 600)) && retries > 0) {
      await new Promise(r => setTimeout(r, retryDelay));
      return fetchPokemon(nameOrId, { retries: retries - 1, retryDelay: Math.round(retryDelay * 1.8) });
    }

    const err = new Error(msg);
    err.status = status;
    throw err;
  } catch (err) {
    // fallback: return cached even if old
    const cachedFallback = cacheGet(key, Infinity);
    if (cachedFallback) return { data: cachedFallback, fromCache: true, fallback: true, originalError: err };
    throw err;
  }
}

async function fetchList(offset = 0, limit = 24){
  const key = `list_${offset}_${limit}`;
  const cached = cacheGet(key, LIST_CACHE_MS);
  if(cached) return { data: cached, fromCache: true };

  const url = `${API_BASE}/pokemon?offset=${offset}&limit=${limit}`;
  const res = await fetch(url);
  if(!res.ok){ const err = new Error('Fetch list error'); err.status = res.status; throw err; }
  const data = await res.json();
  try { cachePut(key, data); } catch(e){ console.warn('cachePut list failed', e); }
  return { data, fromCache: false };
}

/* -------------------------
   Render detail & list (uses state.currentList)
   ------------------------- */
function renderDetail(pokemon, fromCache = false){
  const name = pokemon.name;
  const id = pokemon.id;
  const types = (pokemon.types || []).map(t => t.type.name);
  const abilities = (pokemon.abilities || []).map(a => a.ability.name);

  detailEl.innerHTML = `
    <div class="detail-card">
      <img src="${ARTWORK(id)}" alt="Imagen oficial de ${name}" onerror="this.style.opacity=0.6" />
      <h3 class="name">${name} <small class="muted">#${id}</small></h3>
      <p class="muted">${types.map(t => `<span class="chip">${t}</span>`).join(' ')}</p>
      <p>Altura: ${pokemon.height / 10} m | Peso: ${pokemon.weight / 10} kg</p>
      <p>Habilidades: ${abilities.join(', ')}</p>
      <div style="margin-top:8px">
        <button id="favBtn" class="btn small">${isFavorite(name) ? 'Quitar de Favoritos' : 'Agregar a Favoritos'}</button>
      </div>
      <p class="muted small">${fromCache ? 'Desde caché ✅' : ''}</p>
    </div>
  `;

  const favBtn = document.getElementById('favBtn');
  if(favBtn){
    favBtn.addEventListener('click', () => {
      toggleFavorite(name);
      favBtn.textContent = isFavorite(name) ? 'Quitar de Favoritos' : 'Agregar a Favoritos';
    });
  }
}

function renderList(items){
  state.currentList = items || [];
  if(!items || items.length === 0){
    listEl.innerHTML = '<p class="muted">No hay pokémon en esta página.</p>';
    return;
  }
  // create cards
  listEl.innerHTML = items.map(it => {
    const id = idFromUrl(it.url);
    return `
      <article class="card" data-name="${it.name}" data-id="${id}" tabindex="0">
        <img src="${ARTWORK(id)}" alt="Imagen de ${it.name}" loading="lazy" />
        <div class="name">${it.name}</div>
        <div class="meta">#${id}</div>
      </article>
    `;
  }).join('');
}

/* -------------------------
   Pagination
   ------------------------- */
function renderPagination(total, page, perPage){
  const pages = Math.max(1, Math.ceil(total / perPage));
  const maxButtons = 7;
  let html = '';

  function btn(label, p, current = false){
    return `<button class="page-btn" data-page="${p}" ${current ? 'aria-current="true"' : ''}>${label}</button>`;
  }

  html += btn('Primero', 1, page === 1);
  if(page > 1) html += btn('Anterior', page - 1);

  const half = Math.floor(maxButtons / 2);
  let start = Math.max(1, page - half);
  let end = Math.min(pages, start + maxButtons - 1);
  if(end - start < maxButtons - 1) start = Math.max(1, end - maxButtons + 1);

  for(let p = start; p <= end; p++) html += btn(p, p, p === page);

  if(page < pages) html += btn('Siguiente', page + 1);
  html += btn('Último', pages, page === pages);

  pagination.innerHTML = html;
}

/* -------------------------
   Visual states
   ------------------------- */
function setDetailLoading(msg = 'Cargando...'){ showDetailSkeleton(); }
function setListLoading(msg = 'Lista cargando...'){ showListSkeleton(8); }
function showDetailError(msg = 'Error'){ detailEl.innerHTML = `<p class="muted">${msg}</p>`; }

/* -------------------------
   Actions
   ------------------------- */
async function doSearch(term){
  if(!term) return showDetailError('Ingresá nombre o id');
  term = String(term).trim().toLowerCase();
  setDetailLoading(`Buscando ${term}...`);
  try{
    const resp = await fetchPokemon(term);
    renderDetail(resp.data, resp.fromCache || resp.fallback);
    if(resp.fallback){
      const note = document.createElement('div');
      note.className = 'muted small';
      note.textContent = 'Mostrando desde caché (no se pudo consultar la API en este momento).';
      detailEl.appendChild(note);
      console.warn('fetchPokemon fallback: ', resp.originalError);
    }
    pushRecent(resp.data.name);
  }catch(err){
    if(err && err.status === 404) showDetailError('404 — Pokémon no encontrado');
    else if(err && err.status === 429) showDetailError('429 — Límite alcanzado en la API. Reintentá en unos segundos.');
    else if(err && err.message) showDetailError('Error: ' + err.message);
    else showDetailError('Ocurrió un error al consultar la API');
    console.error('doSearch error:', err);
  }
}

async function loadPage(page = 1, perPage = 24){
  state.page = page;
  state.perPage = perPage;
  localStorage.setItem(PERPAGE_KEY, String(perPage));
  const offset = (page - 1) * perPage;
  setListLoading();
  try{
    const { data, fromCache } = await fetchList(offset, perPage);
    state.total = data.count;
    renderList(data.results);
    renderPagination(data.count, page, perPage);
    if(fromCache) console.info('Listado desde caché');
  }catch(err){
    listEl.innerHTML = '<p class="muted">Error cargando la lista.</p>';
    console.error('loadPage error:', err);
  }
}

/* -------------------------
   Client-side filter (mientras escribe)
   ------------------------- */
function applyFilter(text){
  state.filterText = String(text || '').trim().toLowerCase();
  if(!state.filterText){
    renderList(state.currentList);
    return;
  }
  const filtered = state.currentList.filter(it => it.name.includes(state.filterText));
  // render filtered but preserve ids/url
  if(filtered.length === 0){
    listEl.innerHTML = '<p class="muted">No se encontraron coincidencias en esta página.</p>';
    return;
  }
  listEl.innerHTML = filtered.map(it => {
    const id = idFromUrl(it.url);
    return `
      <article class="card" data-name="${it.name}" data-id="${id}" tabindex="0">
        <img src="${ARTWORK(id)}" alt="Imagen de ${it.name}" loading="lazy" />
        <div class="name">${it.name}</div>
        <div class="meta">#${id}</div>
      </article>
    `;
  }).join('');
}
const debouncedFilter = debounce((e) => applyFilter(e.target.value), 180);

/* -------------------------
   Theme (dark/light) toggle
   ------------------------- */
function setTheme(theme){
  if(theme === 'dark') document.documentElement.classList.add('dark');
  else document.documentElement.classList.remove('dark');
  localStorage.setItem(THEME_KEY, theme);
  if(themeToggle) themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
}
function toggleTheme(){
  const cur = localStorage.getItem(THEME_KEY) || 'light';
  setTheme(cur === 'dark' ? 'light' : 'dark');
}

/* -------------------------
   Events & delegation
   ------------------------- */
listEl.addEventListener('click', async (e) => {
  const card = e.target.closest('.card');
  if(!card) return;
  await doSearch(card.dataset.name);
});
listEl.addEventListener('keydown', async (e) => {
  if(e.key === 'Enter'){ const card = e.target.closest('.card'); if(!card) return; await doSearch(card.dataset.name); }
});
pagination.addEventListener('click', (e) => {
  const btn = e.target.closest('.page-btn'); if(!btn) return; const p = parseInt(btn.dataset.page, 10); if(isNaN(p)) return; loadPage(p, state.perPage); window.scrollTo({ top: 0, behavior: 'smooth' });
});
recentList.addEventListener('click', (e) => { const li = e.target.closest('li'); if(!li || !li.dataset.name) return; doSearch(li.dataset.name); });
favoritesList.addEventListener('click', (e) => { const li = e.target.closest('li'); if(!li || !li.dataset.name) return; doSearch(li.dataset.name); });

searchBtn.addEventListener('click', () => doSearch(searchInput.value.trim()));
searchInput.addEventListener('keydown', (e) => { if(e.key === 'Enter') doSearch(searchInput.value.trim()); });

filterInput.addEventListener('input', debouncedFilter);

perPageSel?.addEventListener('change', () => {
  const per = parseInt(perPageSel.value, 10);
  state.perPage = per;
  loadPage(1, per);
});

themeToggle?.addEventListener('click', toggleTheme);

/* -------------------------
   Init
   ------------------------- */
function initTheme(){
  const saved = localStorage.getItem(THEME_KEY) || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  setTheme(saved);
}
function init(){
  renderRecent();
  renderFavorites();
  initTheme();
  loadPage(1, state.perPage);
}
init();

/* -------------------------
   Exports for tests (if running in Node/Jest)
   ------------------------- */
if(typeof module !== 'undefined'){
  module.exports = { idFromUrl, debounce, cacheGet, cachePut: (k,d)=>cachePut(k,d) };
}
