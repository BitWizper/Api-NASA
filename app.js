const NASA_API = "https://api.nasa.gov";
const APOD_API = "https://science.nasa.gov/wp-json/wp/v2/apod-basic";
const APOD_FIRST_DATE = "1995-06-16";
const CACHE_PREFIX = "nasa-explorer-last-result-v1";

const searchForm = document.querySelector("#search-form");
const credentialsForm = document.querySelector("#credentials-form");
const apiKeyInput = document.querySelector("#api-key");
const observationDate = document.querySelector("#observation-date");
const searchInput = document.querySelector("#search-input");
const hazardOnly = document.querySelector("#hazard-only");
const resultsGrid = document.querySelector("#character-grid");
const loading = document.querySelector("#loading");
const notice = document.querySelector("#notice");
const emptyState = document.querySelector("#empty-state");
const resultsCount = document.querySelector("#results-count");
const dialog = document.querySelector("#character-dialog");
const dialogContent = document.querySelector("#dialog-content");
const viewDescription = document.querySelector("#view-description");
const galleryTitle = document.querySelector("#gallery-title");
let apiKeyForSession = "";
let currentView = "apod";
let currentData = null;
let loadedDate = "";
let requestId = 0;
let activeRequestController = null;
let activeRequestDate = "";
let activeRequestView = "";
let deferredInstallPrompt = null;
const neoPhotoCache = new Map();

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function safeHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function getApiKey() {
  const apiKey = apiKeyInput.value.trim() || apiKeyForSession;
  if (!apiKey) throw new Error("Conecta una NASA API key para consultar los datos.");
  return apiKey;
}

function cacheKey() {
  return currentView === "apod"
    ? `${CACHE_PREFIX}-apod-v2`
    : `${CACHE_PREFIX}-${currentView}`;
}

function plainTextFromHtml(value) {
  return new DOMParser().parseFromString(String(value ?? ""), "text/html").body.textContent.trim();
}

function showNotice(message, type = "error") {
  notice.textContent = message;
  notice.dataset.type = type;
  notice.hidden = false;
}

function clearNotice() {
  notice.textContent = "";
  notice.hidden = true;
}

function setLoading(isLoading) {
  loading.hidden = !isLoading;
  if (isLoading) emptyState.hidden = true;
}

function filteredNearEarthObjects() {
  if (!currentData || currentView !== "neo") return [];
  const query = searchInput.value.trim().toLocaleLowerCase("es");
  return currentData.items.filter((object) => {
    const matchesName = !query || object.name.toLocaleLowerCase("es").includes(query);
    return matchesName && (!hazardOnly.checked || object.is_potentially_hazardous_asteroid);
  });
}

function renderApod(apod) {
  resultsGrid.classList.add("apod-results");
  if (apod.unavailable) {
    resultsGrid.innerHTML = `
      <article class="apod-feature apod-unavailable">
        <div class="apod-unavailable-art" aria-hidden="true"><span>NASA</span><span>APOD ARCHIVE</span></div>
        <div class="apod-copy">
          <p class="eyebrow">ASTRONOMY PICTURE OF THE DAY · ${escapeHtml(apod.date)}</p>
          <h3>La imagen no está disponible en la API</h3>
          <p>NASA devolvió una imagen genérica para esta fecha. Puedes consultar la publicación original en el archivo histórico de APOD.</p>
          <div class="apod-actions">
            <a class="details-button" href="${escapeHtml(apod.archiveUrl)}" target="_blank" rel="noreferrer">ABRIR ARCHIVO APOD <span aria-hidden="true">↗</span></a>
          </div>
          <p class="image-credit">El resto de las consultas y la sección de asteroides siguen disponibles.</p>
        </div>
      </article>
    `;
    resultsCount.textContent = "ARCHIVO HISTÓRICO";
    emptyState.hidden = true;
    return;
  }

  const mediaUrl = safeHttpsUrl(apod.url) || "assets/placeholder.svg";
  const image = apod.media_type === "image";
  const imageMarkup = image
    ? `<img class="apod-image" src="${escapeHtml(mediaUrl)}" alt="${escapeHtml(apod.title || "Imagen astronómica del día")}" loading="lazy">`
    : `<div class="apod-video-preview"><span>▶</span><p>${escapeHtml(apod.media_type === "video" ? "VIDEO ASTRONÓMICO" : "CONTENIDO MULTIMEDIA")}</p></div>`;
  resultsGrid.innerHTML = `
    <article class="apod-feature">
      <button class="apod-media" type="button" data-action="apod-details" aria-label="Ver detalles de ${escapeHtml(apod.title)}">
        ${imageMarkup}
        <span class="apod-date">${escapeHtml(apod.date || "")}</span>
      </button>
      <div class="apod-copy">
        <p class="eyebrow">ASTRONOMY PICTURE OF THE DAY · ${escapeHtml(apod.media_type || "NASA").toUpperCase()}</p>
        <h3>${escapeHtml(apod.title || "Imagen astronómica del día")}</h3>
        <p>${escapeHtml(apod.explanation || "NASA no incluyó una explicación para esta imagen.")}</p>
        <div class="apod-actions">
          <button class="details-button" type="button" data-action="apod-details">VER DETALLES <span aria-hidden="true">↗</span></button>
          ${safeHttpsUrl(apod.hdurl || apod.url) ? `<a class="details-link" href="${escapeHtml(safeHttpsUrl(apod.hdurl || apod.url))}" target="_blank" rel="noreferrer">Abrir original ↗</a>` : ""}
        </div>
        <p class="image-credit">${apod.copyright ? `Crédito: ${escapeHtml(apod.copyright)}` : "Imagen y datos: NASA"}</p>
      </div>
    </article>
  `;
  resultsCount.textContent = "1 IMAGEN";
  emptyState.hidden = true;
}

function renderNearEarthObjects() {
  const objects = filteredNearEarthObjects();
  resultsGrid.innerHTML = objects.map((object) => {
    const diameter = object.estimated_diameter?.kilometers;
    const approach = object.close_approach_data?.[0];
    const distance = Number(approach?.miss_distance?.kilometers);
    const speed = Number(approach?.relative_velocity?.kilometers_per_second);
    const hazardous = Boolean(object.is_potentially_hazardous_asteroid);
    return `
      <article class="character-card neo-card">
        <div class="neo-visual">
          <span class="neo-orbit" aria-hidden="true"></span>
          <span class="neo-asteroid" aria-hidden="true">✦</span>
          <span class="neo-image-label">BUSCANDO FOTO EN NASA...</span>
          <span class="neo-date">${escapeHtml(approach?.close_approach_date || "")}</span>
        </div>
        <div class="neo-body">
          <p class="neo-status ${hazardous ? "is-hazardous" : ""}">${hazardous ? "POTENCIALMENTE PELIGROSO" : "SIN RIESGO IDENTIFICADO"}</p>
          <h3>${escapeHtml(object.name)}</h3>
          <dl class="neo-metrics">
            <div><dt>Diámetro máx.</dt><dd>${Number.isFinite(Number(diameter?.estimated_diameter_max)) ? `${Number(diameter.estimated_diameter_max).toFixed(3)} km` : "N/D"}</dd></div>
            <div><dt>Distancia</dt><dd>${Number.isFinite(distance) ? `${new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 }).format(distance)} km` : "N/D"}</dd></div>
            <div><dt>Velocidad</dt><dd>${Number.isFinite(speed) ? `${speed.toFixed(1)} km/s` : "N/D"}</dd></div>
          </dl>
          <button class="details-button" type="button" data-object-id="${escapeHtml(object.id)}">MÁS INFORMACIÓN <span aria-hidden="true">↗</span></button>
        </div>
      </article>
    `;
  }).join("");
  resultsCount.textContent = `${objects.length} DE ${currentData.items.length} OBJETOS`;
  emptyState.hidden = objects.length > 0;
  resultsGrid.querySelectorAll(".neo-card").forEach((card) => {
    const object = objects.find((item) => String(item.id) === card.querySelector("[data-object-id]")?.dataset.objectId);
    if (object) loadNeoPhoto(object, card);
  });
}

function findNeoPhoto(object) {
  const cacheKey = String(object.id);
  if (neoPhotoCache.has(cacheKey)) return neoPhotoCache.get(cacheKey);

  const photoPromise = (async () => {
    const nameParts = object.name.replace(/[()]/g, "").trim().split(/\s+/);
    const lastNamePart = nameParts.find((part) => /[a-z]/i.test(part) && !/^\d+[a-z]?\d*$/i.test(part)) || nameParts[nameParts.length - 1];
    const endpoint = new URL("https://images-api.nasa.gov/search");
    endpoint.searchParams.set("q", `${lastNamePart} asteroid`);
    endpoint.searchParams.set("media_type", "image");
    endpoint.searchParams.set("page_size", "20");
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(endpoint, { signal: controller.signal });
      if (!response.ok) throw new Error(`NASA Images respondió con el código ${response.status}.`);
      const payload = await response.json();
      const normalizedName = object.name.replace(/[()]/g, "").toLocaleLowerCase("en").replace(/[^a-z0-9]+/g, "");
      const normalizedLastNamePart = lastNamePart.toLocaleLowerCase("en");
      const entries = payload.collection?.items || [];
      const photo = entries.find((entry) => {
        const metadata = entry.data?.[0];
        const text = `${metadata?.title || ""} ${metadata?.description || ""}`.toLocaleLowerCase("en");
        const title = metadata?.title || "";
        const normalizedTitle = title.toLocaleLowerCase("en").replace(/[^a-z0-9]+/g, "");
        const matchesName = normalizedTitle.includes(normalizedName) ||
          (/[a-z]/i.test(normalizedLastNamePart) && new RegExp(`\\b${normalizedLastNamePart.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(title));
        const isIllustration = /\b(artist(?:'s)? concept|artist rendering|illustration|rendering|simulation|animation|lithograph)\b/i.test(text);
        const imageUrl = safeHttpsUrl(entry.links?.find((link) => link.rel === "preview")?.href);
        return matchesName && !isIllustration && Boolean(imageUrl);
      });
      if (!photo) return null;
      return {
        url: safeHttpsUrl(photo.links.find((link) => link.rel === "preview").href),
        title: photo.data[0].title
      };
    } finally {
      window.clearTimeout(timeoutId);
    }
  })().catch((error) => {
    console.warn(`No se pudo buscar una fotografía NASA para ${object.name}.`, error);
    return { unavailable: true };
  });
  neoPhotoCache.set(cacheKey, photoPromise);
  return photoPromise;
}

async function loadNeoPhoto(object, card) {
  const visual = card.querySelector(".neo-visual");
  const label = visual.querySelector(".neo-image-label");
  const photo = await findNeoPhoto(object);
  if (!card.isConnected || currentView !== "neo") return;
  if (photo?.url) {
    const image = document.createElement("img");
    image.className = "neo-photo";
    image.src = photo.url;
    image.alt = photo.title || `Fotografía NASA relacionada con ${object.name}`;
    image.loading = "lazy";
    image.addEventListener("error", () => {
      image.remove();
      visual.classList.remove("has-photo");
      label.textContent = "FOTO NO DISPONIBLE";
    }, { once: true });
    visual.prepend(image);
    visual.classList.add("has-photo");
    label.textContent = "IMAGEN REAL · NASA";
  } else {
    label.textContent = photo?.unavailable
      ? "ARCHIVO DE NASA NO DISPONIBLE"
      : "SIN FOTO REAL EN ARCHIVO NASA";
  }
}

function render() {
  resultsGrid.classList.toggle("apod-results", currentView === "apod");
  if (!currentData) {
    resultsGrid.replaceChildren();
    resultsCount.textContent = "";
    emptyState.hidden = true;
    return;
  }
  if (currentView === "apod") renderApod(currentData);
  else renderNearEarthObjects();
}

function saveCache(date) {
  try {
    localStorage.setItem(cacheKey(), JSON.stringify({
      savedAt: new Date().toISOString(),
      date,
      data: currentData
    }));
  } catch (error) {
    console.warn("No se pudo guardar la caché local de NASA.", error);
    showNotice("No fue posible guardar los datos para consultarlos sin conexión. Revisa el espacio disponible del navegador.", "warning");
  }
}

function loadCache(notify = true, restoreDate = true) {
  try {
    const saved = localStorage.getItem(cacheKey());
    if (!saved) return null;
    const cachedData = JSON.parse(saved);
    const validData = currentView === "apod"
      ? cachedData.data && (
        typeof cachedData.data.title === "string" ||
        (cachedData.data.unavailable === true &&
          /^\d{4}-\d{2}-\d{2}$/.test(cachedData.date) &&
          cachedData.data.date === cachedData.date &&
          cachedData.data.archiveUrl === `https://apod.nasa.gov/apod/ap${cachedData.date.slice(2).replaceAll("-", "")}.html`)
      )
      : cachedData.data && Array.isArray(cachedData.data.items);
    if (!validData) return null;
    currentData = cachedData.data;
    loadedDate = cachedData.date || "";
    if (restoreDate && cachedData.date) observationDate.value = cachedData.date;
    render();
    if (notify) {
      const date = new Date(cachedData.savedAt);
      showNotice(`Sin conexión: mostrando los últimos datos guardados${Number.isNaN(date.getTime()) ? "" : ` (${date.toLocaleString("es-MX")})`}.`, "warning");
    }
    return cachedData;
  } catch (error) {
    console.error("No se pudo leer la caché local de NASA:", error);
    if (notify) showNotice("La caché local no se pudo leer. Reconéctate e intenta cargar los datos de nuevo.", "error");
    return null;
  }
}

function apiError(payload, status) {
  const message = payload.error?.message || payload.msg || payload.message || payload.error_message;
  if (status === 403 || status === 429) {
    return new Error(message || "NASA rechazó la clave o se alcanzó el límite de solicitudes. Comprueba tu API key e inténtalo más tarde.");
  }
  if (status === 404) return new Error(message || "NASA no tiene datos disponibles para esa fecha.");
  return new Error(message || `La API de NASA respondió con el código ${status}.`);
}

async function fetchNasaData() {
  let apiKey = "";
  if (currentView === "neo") {
    try {
      apiKey = getApiKey();
    } catch (error) {
      showNotice(error.message, "warning");
      return;
    }
  }
  const date = observationDate.value;
  if (!date) {
    showNotice("Selecciona una fecha para consultar los datos.", "warning");
    return;
  }
  if (date > localDateString()) {
    showNotice("La API no tiene datos disponibles para fechas futuras. Selecciona hoy o una fecha anterior.", "warning");
    return;
  }
  if (currentView === "apod" && date < APOD_FIRST_DATE) {
    showNotice("APOD publica imágenes desde el 16 de junio de 1995. Selecciona esa fecha o una posterior.", "warning");
    return;
  }
  if (activeRequestController && activeRequestView === currentView && activeRequestDate === date) return;

  const currentRequest = ++requestId;
  activeRequestController?.abort();
  const controller = new AbortController();
  activeRequestController = controller;
  activeRequestDate = date;
  activeRequestView = currentView;
  const timeoutId = window.setTimeout(() => controller.abort(), currentView === "apod" ? 30000 : 15000);
  const endpoint = currentView === "apod"
    ? new URL(APOD_API)
    : new URL(`${NASA_API}/neo/rest/v1/feed`);
  if (currentView === "apod") {
    const apodDateCode = date.slice(2).replaceAll("-", "");
    endpoint.searchParams.set("date_from", apodDateCode);
    endpoint.searchParams.set("date_to", apodDateCode);
  } else {
    endpoint.searchParams.set("api_key", apiKey);
    endpoint.searchParams.set("start_date", date);
    endpoint.searchParams.set("end_date", date);
  }

  clearNotice();
  setLoading(true);
  try {
    const response = await fetch(endpoint, {
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
    const payload = await response.json();
    if (!response.ok || payload.error || payload.errors) {
      throw apiError(payload, response.status);
    }
    if (currentRequest !== requestId) return;

    if (currentView === "apod") {
      const apod = Array.isArray(payload)
        ? payload.find((item) => item.date === date)
        : null;
      if (!apod || !apod.title || !apod.media_type) {
        throw new Error("NASA no devolvió un APOD válido para la fecha seleccionada.");
      }
      const imageUrl = safeHttpsUrl(apod.hdurl);
      if (apod.media_type === "image" && !imageUrl) {
        throw new Error("El APOD existe, pero NASA no proporcionó una URL válida para su imagen.");
      }
      currentData = {
        date: apod.date,
        title: apod.title,
        media_type: apod.media_type,
        explanation: plainTextFromHtml(apod.explanation),
        url: apod.media_type === "image" ? imageUrl : safeHttpsUrl(apod.permalink || apod.url),
        hdurl: imageUrl,
        permalink: safeHttpsUrl(apod.permalink || apod.url),
        copyright: plainTextFromHtml(apod.copyright || apod.credit)
      };
    } else {
      const items = payload.near_earth_objects?.[date];
      if (!Array.isArray(items)) throw new Error("La respuesta de NeoWs no contiene una lista de objetos para esa fecha.");
      currentData = { items };
    }
    loadedDate = date;
    render();
    saveCache(date);
    if (currentView === "neo" && currentData.items.length === 0) {
      showNotice("NASA no reporta asteroides cercanos para la fecha seleccionada.", "info");
    }
  } catch (error) {
    if (currentRequest !== requestId) return;
    console.error(`Error al consultar NASA ${currentView}:`, error);
    const cachedData = loadCache(false, false);
    const detail = error.name === "AbortError"
      ? "La solicitud a NASA tardó demasiado y se canceló."
      : error instanceof TypeError
        ? "No se pudo conectar con NASA. Comprueba tu conexión e inténtalo de nuevo."
        : `No se pudieron cargar los datos: ${error.message}`;
    if (cachedData) {
      render();
      const savedAt = new Date(cachedData.savedAt);
      showNotice(`${detail} Mostrando los últimos datos guardados${Number.isNaN(savedAt.getTime()) ? "" : ` (${savedAt.toLocaleString("es-MX")})`}.`, "warning");
    } else {
      showNotice(`${detail} Cuando tengas conexión, vuelve a intentarlo.`, "error");
    }
  } finally {
    window.clearTimeout(timeoutId);
    if (currentRequest === requestId) {
      activeRequestController = null;
      activeRequestDate = "";
      activeRequestView = "";
      setLoading(false);
      render();
    }
  }
}

function showApodDetails() {
  const apod = currentData;
  if (!apod) return;
  const mediaUrl = safeHttpsUrl(apod.url);
  const videoFrame = apod.media_type === "video" && mediaUrl
    ? `<iframe class="nasa-video" title="${escapeHtml(apod.title)}" src="${escapeHtml(mediaUrl)}" allowfullscreen loading="lazy"></iframe>`
    : "";
  const fullImage = apod.media_type === "image" && mediaUrl
    ? `<img class="dialog-apod-image" src="${escapeHtml(safeHttpsUrl(apod.hdurl) || mediaUrl)}" alt="${escapeHtml(apod.title)}">`
    : videoFrame;
  dialogContent.innerHTML = `
    <div class="nasa-dialog-content">
      <p class="eyebrow">ASTRONOMY PICTURE OF THE DAY · ${escapeHtml(apod.date)}</p>
      <h2 id="dialog-name">${escapeHtml(apod.title)}</h2>
      ${fullImage}
      <p class="nasa-explanation">${escapeHtml(apod.explanation || "NASA no incluyó una explicación para esta imagen.")}</p>
      ${apod.copyright ? `<p class="image-credit">Crédito: ${escapeHtml(apod.copyright)}</p>` : ""}
      ${safeHttpsUrl(apod.hdurl || apod.url) ? `<a class="dialog-link" href="${escapeHtml(safeHttpsUrl(apod.hdurl || apod.url))}" target="_blank" rel="noreferrer">Abrir recurso original ↗</a>` : ""}
    </div>
  `;
  dialog.showModal();
}

function showObjectDetails(object) {
  const approach = object.close_approach_data?.[0];
  const diameter = object.estimated_diameter?.kilometers;
  const jplUrl = safeHttpsUrl(object.nasa_jpl_url);
  dialogContent.innerHTML = `
    <div class="nasa-dialog-content">
      <p class="eyebrow">NEOWS · OBJETO CERCANO A LA TIERRA</p>
      <h2 id="dialog-name">${escapeHtml(object.name)}</h2>
      <p class="neo-dialog-status ${object.is_potentially_hazardous_asteroid ? "is-hazardous" : ""}">${object.is_potentially_hazardous_asteroid ? "Clasificado como potencialmente peligroso" : "No clasificado como potencialmente peligroso"}</p>
      <dl class="neo-detail-grid">
        <div><dt>Diámetro estimado</dt><dd>${Number(diameter?.estimated_diameter_min).toFixed(3)}–${Number(diameter?.estimated_diameter_max).toFixed(3)} km</dd></div>
        <div><dt>Acercamiento</dt><dd>${escapeHtml(approach?.close_approach_date_full || approach?.close_approach_date || "Sin datos")}</dd></div>
        <div><dt>Distancia a la Tierra</dt><dd>${Number(approach?.miss_distance?.kilometers).toLocaleString("es-MX", { maximumFractionDigits: 0 })} km</dd></div>
        <div><dt>Velocidad relativa</dt><dd>${Number(approach?.relative_velocity?.kilometers_per_second).toFixed(2)} km/s</dd></div>
        <div><dt>Magnitud absoluta</dt><dd>${Number(object.absolute_magnitude_h).toFixed(2)}</dd></div>
      </dl>
      ${jplUrl ? `<a class="dialog-link" href="${escapeHtml(jplUrl)}" target="_blank" rel="noreferrer">Consultar órbita en NASA/JPL ↗</a>` : ""}
    </div>
  `;
  dialog.showModal();
}

function setView(view) {
  requestId += 1;
  activeRequestController?.abort();
  activeRequestController = null;
  activeRequestDate = "";
  activeRequestView = "";
  setLoading(false);
  currentView = view;
  document.querySelectorAll(".view-tab").forEach((tab) => {
    const active = tab.dataset.view === view;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  const isApod = view === "apod";
  searchInput.hidden = isApod;
  document.querySelector("#hazard-label").hidden = isApod;
  observationDate.min = isApod ? APOD_FIRST_DATE : "";
  searchInput.value = "";
  hazardOnly.checked = false;
  observationDate.max = localDateString();
  galleryTitle.innerHTML = isApod ? "Ventanas al <span>universo</span>" : "Vecindario <span>cósmico</span>";
  viewDescription.textContent = isApod
    ? "La imagen astronómica seleccionada por NASA para la fecha."
    : "Asteroides que pasan cerca de la Tierra en la fecha seleccionada.";
  currentData = null;
  loadedDate = "";
  render();
  clearNotice();
  if (isApod || apiKeyForSession) fetchNasaData();
  else loadCache();
}

document.querySelectorAll(".view-tab").forEach((tab) => {
  tab.addEventListener("click", () => setView(tab.dataset.view));
});

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (currentView === "neo" && loadedDate === observationDate.value && currentData) {
    renderNearEarthObjects();
    return;
  }
  fetchNasaData();
});

observationDate.addEventListener("change", () => {
  if (currentView === "apod") fetchNasaData();
});

credentialsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  apiKeyForSession = apiKeyInput.value.trim();
  apiKeyInput.value = "";
  fetchNasaData();
});

searchInput.addEventListener("input", renderNearEarthObjects);
hazardOnly.addEventListener("change", renderNearEarthObjects);
resultsGrid.addEventListener("click", (event) => {
  const action = event.target.closest("[data-action='apod-details']");
  if (action) {
    showApodDetails();
    return;
  }
  const objectButton = event.target.closest("[data-object-id]");
  if (!objectButton) return;
  const object = currentData?.items.find((item) => String(item.id) === objectButton.dataset.objectId);
  if (object) showObjectDetails(object);
});
document.querySelector("#dialog-close").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});
dialog.addEventListener("close", () => dialogContent.replaceChildren());

window.addEventListener("online", () => {
  if (!currentData) showNotice("Conexión restablecida. Consulta de nuevo los datos de NASA.", "info");
});
window.addEventListener("offline", () => {
  if (currentData) showNotice("Estás sin conexión. Puedes seguir explorando los últimos datos guardados.", "warning");
});
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  document.querySelector("#install-button").hidden = false;
});
document.querySelector("#install-button").addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  await deferredInstallPrompt.prompt();
  deferredInstallPrompt = null;
  document.querySelector("#install-button").hidden = true;
});

observationDate.value = localDateString();
observationDate.max = localDateString();
observationDate.min = APOD_FIRST_DATE;
apiKeyForSession = typeof window.NASA_CONFIG?.apiKey === "string"
  ? window.NASA_CONFIG.apiKey.trim()
  : "";
if (apiKeyForSession) {
  document.querySelector(".credentials-panel").hidden = true;
  document.querySelector("#credentials-title").innerHTML = "NASA está <span>conectada</span>";
  document.querySelector(".credentials-copy > p:not(.eyebrow)").textContent =
    "La API key se carga desde la configuración local de esta app y se usa para consultar directamente api.nasa.gov. No la publiques ni compartas esta versión.";
  document.querySelector(".credentials-note").textContent =
    "Clave local detectada. Se mantiene solo en memoria; no se guarda en la caché. Puedes reemplazarla aquí si generas otra.";
  document.querySelector("#api-key").placeholder = "Pega una nueva API key para reemplazarla";
  fetchNasaData();
} else {
  fetchNasaData();
}
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      console.error("No se pudo registrar el service worker:", error);
      showNotice("La app funciona, pero no se pudo activar el modo instalable/offline. Ábrela desde localhost o HTTPS.", "warning");
    });
  });
}
if (!navigator.onLine) loadCache();
