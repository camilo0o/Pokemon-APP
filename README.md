# Pokemon-APP
Pequeña Pokédex creada con HTML, CSS y JavaScript (sin frameworks). Consume la PokéAPI y ofrece:
- Búsqueda por nombre o numero de pokemon.
- Listado con paginación (client-side).
- Filtro en vivo mientras escribes (cliente) — usando el segundo `searchInput` de filter.
- Caché en `localStorage` (detalles y listados).
- "Últimas búsquedas" y "Favoritos".
- Skeleton loaders, modo oscuro/claro, y reintentos en peticiones.

---
## Estructura del proyecto

- `index.htm` — estructura semántica y elementos principales.
- `index.css` — estilos (incluye modo oscuro, skeletons, mejoras visuales para cards).
- `index.js` — lógica completa: fetch, caché, render, filtros, dark mode, favoritos, paginación.
- `README.md` — este archivo.

---

## Cómo usar el sitio (guía de usuario)
1. Abrí `index.html` en tu navegador.  
   - Recomendado: servir con servidor local para evitar problemas `file://`:
     ```bash
     python -m http.server 8000
     # luego abrir http://localhost:8000
     ```
2. Controles principales (ubicados en el header):
   - **Input “Buscar Pokémon”**  
     - Ingresá el nombre o numero del pokemon (ej. `pikachu` o `25`) y presioná **Enter** o **Buscar**.
     - Siempre intenta traer **la ficha del Pokémon** desde la PokéAPI, aunque no esté en la página actual.
     - Si ya lo buscaste antes, lo toma del caché.
    - **Input “Filtrar listado”**  
     - Mientras escribís, filtra en vivo **los Pokémon de la página actual** (sin recargar ni hacer peticiones a la API).
     - Borra el texto para volver a ver todos los Pokémon de la página actual.

   - **Toggle tema**: cambia entre modo claro y oscuro (persistente en `localStorage`).
3. Listado y paginación:
   - Cambiá el valor "Por página" para ajustar cuántas tarjetas ver (ej. 24, 36, 12).
   - Usá los controles de paginación (Primero/Anterior/Números/Siguiente/Último) para navegar.
   - Clic en una **tarjeta** abre la ficha del Pokémon.
4. Ficha del Pokémon:
   - Muestra **nombre**, **número**, **tipos**, **altura**, **peso**, **habilidades** e **imagen oficial**.
   - Botón **Agregar/Quitar de Favoritos**.
   - Cuando hay problema de red, si existe una versión en caché se mostrará con la nota "Desde caché ✅".

5. Últimas búsquedas y Favoritos:
   - **Últimas búsquedas** guarda hasta 10 entradas (recientes arriba).
   - **Favoritos** guarda hasta 50. Ambos son **clicables** para abrir la ficha.

---

## Detalles técnicos / decisiones

- **Caché**:
  - `localStorage` con clave `pkdx_cache_v1`. Cada entrada guarda `{ data, savedAt }`.
  - Listado: cache por `offset_limit` durante 10 minutos.
  - Detalles: cache por `pokemon_<nameOrId>` durante 24 horas.
  - Si falla la red, el sistema intenta usar caché como fallback (si existe).

- **Fetch robusto**:
  - Reintentos automáticos para 429 y errores 5xx (2 reintentos por defecto).
  - En caso de fallo definitivo, se intenta mostrar caché (si está disponible) y se muestra una nota al usuario.

- **Filtros y búsqueda separada**:
  - `searchInput` **Buscar Pokémon** hace peticiones a la API para traer un Pokémon puntual.
  - `filterInput` **Filtrar listado** aplica filtro en la lista cargada en la página actual (client-side).

- **UX**:
  - Skeletons para detalle y listado durante la carga.
  - Estados: "Buscando...", "Lista cargando...", "404 — Pokémon no encontrado", etc.

- **Accesibilidad**:
  - Elementos `tabindex`, `aria-live` en listas y `aria-label` en inputs.
  - `:focus` visible para tarjetas y botones.

---

## Solución de problemas comunes

- **Las imágenes no cargan / CORS / file://**: sirve la carpeta con `python -m http.server` o `npx http-server`.
- **429 (Too Many Requests)**: espera unos segundos (el sistema reintentará). Considerá reducir frecuencia de peticiones.
- **Datos antiguos en pantalla**: vaciá caché con `localStorage.removeItem('pkdx_cache_v1')`.
- **Modo oscuro no cambia**: verificá que el botón toggle agrega o quita `class="dark"` sobre `<html>`

---