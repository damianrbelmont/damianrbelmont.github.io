console.log("app.js cargado");

const INDEX_FILE_PATH = "data/public-index.json";
const entityCache = new Map();
let indexCache = null;
const categoryItemsCache = new Map();

const CATEGORY_CONFIG = {
  characters: {
    label: "Personajes",
    indexKeys: ["characters", "personajes"],
    typeKeys: ["character"]
  },
  locations: {
    label: "Localizaciones",
    indexKeys: ["locations", "lugares", "localizaciones"],
    typeKeys: ["location"]
  },
  organizations: {
    label: "Organizaciones",
    indexKeys: ["organizations", "organizaciones"],
    typeKeys: ["organization"]
  },
  events: {
    label: "Eventos",
    indexKeys: ["events", "eventos"],
    typeKeys: ["event"]
  },
  artifacts: {
    label: "Objetos",
    indexKeys: ["artifacts", "objects", "objetos"],
    typeKeys: ["artifact"]
  },
  creatures: {
    label: "Criaturas",
    indexKeys: ["creatures", "criaturas"],
    typeKeys: ["creature"]
  }
};

function normalizeRichText(value) {
  return (value || "")
    .toString()
    .replace(/\r\n?/g, "\n")
    .replace(/\\\\n/g, "\n")
    .replace(/\\n/g, "\n");
}

function getWikiTargetToken(token) {
  const cleanToken = (token || "").toString().trim();
  if (!cleanToken) return "";
  const separatorIndex = cleanToken.indexOf("|");
  if (separatorIndex === -1) return cleanToken;
  return cleanToken.slice(0, separatorIndex).trim();
}

function getWikiDisplayLabel(token) {
  const cleanToken = (token || "").toString().trim();
  if (!cleanToken) return "";
  const separatorIndex = cleanToken.indexOf("|");
  if (separatorIndex === -1) return cleanToken;
  const label = cleanToken.slice(separatorIndex + 1).trim();
  return label || cleanToken.slice(0, separatorIndex).trim();
}

function stripWikiMarkup(value) {
  return (value || "")
    .toString()
    .replace(/\[\[([^[\]]+)\]\]/g, (_match, token) => getWikiDisplayLabel(token))
    .trim();
}

function unwrapWikiReference(value) {
  const cleanValue = (value || "").toString().trim();
  const wrappedMatch = cleanValue.match(/^\[\[([^[\]]+)\]\]$/);
  if (!wrappedMatch) return cleanValue;
  return getWikiTargetToken(wrappedMatch[1]);
}

function getFirstStringValueFromPaths(source, paths) {
  for (const path of paths) {
    const parts = path.split(".");
    let current = source;
    let valid = true;

    for (const part of parts) {
      if (!current || typeof current !== "object" || !(part in current)) {
        valid = false;
        break;
      }
      current = current[part];
    }

    if (valid && typeof current === "string" && current.trim()) {
      return current.trim();
    }
  }
  return "";
}

function getFirstValueFromPaths(source, paths) {
  for (const path of paths) {
    const parts = path.split(".");
    let current = source;
    let valid = true;

    for (const part of parts) {
      if (!current || typeof current !== "object" || !(part in current)) {
        valid = false;
        break;
      }
      current = current[part];
    }

    if (valid && current !== undefined && current !== null) {
      return current;
    }
  }
  return undefined;
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

function uniqueStrings(values) {
  const set = new Set();
  values.forEach((value) => {
    const clean = stripWikiMarkup(value);
    if (clean) set.add(clean);
  });
  return [...set];
}

function extractTextValues(value) {
  return toArray(value).flatMap((item) => {
    if (typeof item === "string" || typeof item === "number") {
      return [unwrapWikiReference(item)];
    }
    if (item && typeof item === "object") {
      const candidate = item.id || item.slug || item.ref || item.name || item.title || item.label;
      if (candidate) return [unwrapWikiReference(candidate)];
    }
    return [];
  });
}

function getJoinedSectionText(source) {
  const sections = source?.content?.sections;
  if (!Array.isArray(sections)) return "";

  const texts = sections
    .map((section) => normalizeRichText(section?.text).trim())
    .filter(Boolean);
  return texts.join("\n\n");
}

function getFallbackImage(source) {
  const direct = getFirstStringValueFromPaths(source, [
    "image",
    "portrait",
    "thumbnail",
    "cover",
    "media.image",
    "media.portrait",
    "assets.image"
  ]);
  if (direct) return direct;

  let foundImage = "";
  const stack = [source];
  while (stack.length > 0 && !foundImage) {
    const current = stack.pop();
    if (!current || typeof current !== "object") continue;

    Object.values(current).forEach((value) => {
      if (typeof value === "string") {
        const looksLikeImage = /(assets\/images\/|https?:\/\/).+\.(webp|avif|png|jpg|jpeg|gif)$/i.test(value.trim());
        if (looksLikeImage && !foundImage) {
          foundImage = value.trim();
        }
      } else if (typeof value === "object") {
        stack.push(value);
      }
    });
  }

  return foundImage;
}

function normalizeEntityData(raw) {
  const data = { ...raw };
  const joinedSections = getJoinedSectionText(raw);
  const rawSections = Array.isArray(raw?.content?.sections)
    ? raw.content.sections
    : Array.isArray(raw?.sections)
      ? raw.sections
      : [];

  data.title = stripWikiMarkup(getFirstStringValueFromPaths(raw, [
    "title",
    "name"
  ]) || data.title || data.name || "");
  data.name = stripWikiMarkup(data.name || data.title || "");

  // Prefer the new Firebase schema first.
  data.summary = normalizeRichText(getFirstStringValueFromPaths(raw, [
    "content.summary",
    "content.intro",
    "overview",
    "summary",
    "synopsis",
    "bio"
  ]) || data.summary || "");

  data.description = normalizeRichText(getFirstStringValueFromPaths(raw, [
    "content.description",
    "content.body",
    "description",
    "details"
  ]) || joinedSections || data.description || "");

  if (!data.summary && data.description) {
    data.summary = data.description.split("\n")[0].slice(0, 220);
  }

  data.image = getFirstStringValueFromPaths(raw, [
    "media.image",
    "media.cover",
    "assets.image",
    "image",
    "portrait",
    "thumbnail",
    "cover"
  ]) || data.image || getFallbackImage(raw);

  if (typeof data.type === "string") {
    const normalizedType = data.type.trim().toLowerCase();
    const typeAliases = {
      characters: "character",
      locations: "location",
      organizations: "organization"
    };
    data.type = typeAliases[normalizedType] || normalizedType;
  }

  if (!Array.isArray(data.affiliation) && typeof data.affiliation === "string") {
    data.affiliation = [data.affiliation];
  }

  if (!Array.isArray(data.related) && Array.isArray(data.relations)) {
    data.related = data.relations;
  }

  if (!data.birthplace) {
    data.birthplace = getFirstStringValueFromPaths(raw, ["birthplace", "origin", "placeOfBirth"]);
  }

  data.birthDate = getFirstStringValueFromPaths(raw, [
    "extra.birthDate",
    "extra.birth_date",
    "extra.fechaNacimiento",
    "extra.fecha_nacimiento",
    "birthDate",
    "birth_date",
    "fechaNacimiento",
    "fecha_nacimiento"
  ]);

  data.deathDate = getFirstStringValueFromPaths(raw, [
    "extra.deathDate",
    "extra.death_date",
    "extra.fechaMuerte",
    "extra.fecha_muerte",
    "deathDate",
    "death_date",
    "fechaMuerte",
    "fecha_muerte"
  ]);

  data.aliases = uniqueStrings([
    ...extractTextValues(getFirstValueFromPaths(raw, ["extra.aliases", "extra.alias", "extra.aka", "aliases", "alias"])),
    ...extractTextValues(raw.alias)
  ]);

  data.affiliation = uniqueStrings([
    ...extractTextValues(getFirstValueFromPaths(raw, ["extra.affiliations", "extra.affiliation", "affiliations", "affiliation"])),
    ...extractTextValues(data.affiliation)
  ]);

  const rawRelations = getFirstValueFromPaths(raw, ["extra.relations", "relations"]);
  const relationMap = {
    characters: [],
    events: [],
    locations: [],
    organizations: [],
    others: []
  };

  const keyAlias = {
    characters: "characters",
    character: "characters",
    personajes: "characters",
    events: "events",
    event: "events",
    eventos: "events",
    locations: "locations",
    location: "locations",
    lugares: "locations",
    localizaciones: "locations",
    organizations: "organizations",
    organization: "organizations",
    organizaciones: "organizations"
  };

  if (Array.isArray(rawRelations) || typeof rawRelations === "string") {
    relationMap.others = uniqueStrings(extractTextValues(rawRelations));
  } else if (rawRelations && typeof rawRelations === "object") {
    Object.entries(rawRelations).forEach(([key, value]) => {
      const normalizedKey = keyAlias[(key || "").toString().toLowerCase()] || "others";
      relationMap[normalizedKey] = uniqueStrings([
        ...relationMap[normalizedKey],
        ...extractTextValues(value)
      ]);
    });
  }

  if (Array.isArray(data.related)) {
    relationMap.others = uniqueStrings([...relationMap.others, ...extractTextValues(data.related)]);
  }

  data.relationsByType = relationMap;

  data.sections = rawSections
    .map((section, index) => {
      const id = unwrapWikiReference((section?.id || `section_${index + 1}`).toString());
      const title = stripWikiMarkup((section?.title || section?.tittle || formatName(id)).toString().trim());
      const text = normalizeRichText(section?.text || section?.description).trim();
      return {
        id,
        title: title || `Seccion ${index + 1}`,
        text,
        order: Number.isFinite(Number(section?.order)) ? Number(section.order) : index
      };
    })
    .filter((section) => section.text)
    .sort((a, b) => a.order - b.order);

  return data;
}

function escapeHtml(value) {
  return (value || "")
    .toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isLikelyEntityId(value) {
  const text = (value || "").toString().trim();
  if (!text) return false;
  return /^[a-z0-9_:-]+$/i.test(text) && !/\s/.test(text);
}

async function resolveRelationLabels(ids) {
  const cleanIds = uniqueStrings(ids);
  const resolved = await Promise.all(cleanIds.map(async (id) => {
    if (!isLikelyEntityId(id)) {
      return { id: "", label: id, linkable: false };
    }
    const name = await getEntityName(id);
    return { id, label: name || formatName(id), linkable: true };
  }));
  return resolved;
}

function renderRelationList(items) {
  if (!items || items.length === 0) return "";
  return `
    <ul class="sidebar-list">
      ${items.map((item) => `
        <li>${item.linkable
          ? `<a href="${getEntityHrefById(item.id)}">${escapeHtml(item.label)}</a>`
          : `<span>${escapeHtml(item.label)}</span>`
        }</li>
      `).join("")}
    </ul>
  `;
}

function getIdFromURL() {
  const params = new URLSearchParams(window.location.search);
  return unwrapWikiReference(params.get("id"));
}

function formatName(id) {
  return stripWikiMarkup(id).replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
}

function formatType(type) {
  const types = {
    character: "Personaje",
    location: "Lugar",
    organization: "Organizacion",
    event: "Evento",
    artifact: "Artefacto",
    creature: "Criatura"
  };
  return types[type] || type;
}

function normalizeEntityType(type) {
  const normalized = (type || "").toString().trim().toLowerCase();
  const aliasMap = {
    characters: "character",
    personaje: "character",
    personajes: "character",
    locations: "location",
    lugar: "location",
    lugares: "location",
    localizacion: "location",
    localizaciones: "location",
    organizations: "organization",
    organizacion: "organization",
    organizaciones: "organization",
    events: "event",
    evento: "event",
    eventos: "event",
    artifacts: "artifact",
    objeto: "artifact",
    objetos: "artifact",
    creatures: "creature",
    criatura: "creature",
    criaturas: "creature"
  };
  return aliasMap[normalized] || normalized;
}

function normalizePublicationStatus(value) {
  const normalized = (value || "published").toString().trim().toLowerCase();
  return normalized === "draft" ? "draft" : "published";
}

function normalizePublicationVisibility(value) {
  const normalized = (value || "public").toString().trim().toLowerCase();
  return normalized === "private" ? "private" : "public";
}

function normalizeIndexEntry(rawEntry) {
  if (!rawEntry || typeof rawEntry !== "object") return null;

  const id = unwrapWikiReference((rawEntry.id || "").toString().trim());
  if (!id) return null;

  return {
    id,
    slug: (rawEntry.slug || "").toString().trim(),
    title: stripWikiMarkup((rawEntry.title || rawEntry.name || "").toString().trim()),
    type: normalizeEntityType(rawEntry.type),
    section: (rawEntry.section || "").toString().trim(),
    subsection: (rawEntry.subsection || "").toString().trim(),
    excerpt: stripWikiMarkup((rawEntry.excerpt || "").toString().trim()),
    image: (rawEntry.image || "").toString().trim(),
    path: (rawEntry.path || "").toString().trim().replace(/^\/+/, ""),
    status: normalizePublicationStatus(rawEntry.status),
    visibility: normalizePublicationVisibility(rawEntry.visibility)
  };
}

function getIndexEntries(indexData) {
  const rawEntries = indexData?.entries;
  if (!Array.isArray(rawEntries)) return [];
  return rawEntries
    .map((entry) => normalizeIndexEntry(entry))
    .filter(Boolean);
}

function getIndexEntryById(indexData, id) {
  const cleanId = unwrapWikiReference((id || "").toString().trim());
  if (!cleanId) return null;
  const entries = getIndexEntries(indexData);
  return entries.find((entry) => entry.id === cleanId)
    || entries.find((entry) => entry.id.toLowerCase() === cleanId.toLowerCase())
    || null;
}

function getEntryHref(entry) {
  if (entry?.slug) return `${encodeURIComponent(entry.slug)}.html`;
  if (entry?.id) return `?id=${encodeURIComponent(entry.id)}`;
  return "index.html";
}

function getEntityHrefById(id) {
  const cleanId = unwrapWikiReference((id || "").toString().trim());
  if (!cleanId) return "index.html";
  const entry = indexCache ? getIndexEntryById(indexCache, cleanId) : null;
  return getEntryHref(entry || { id: cleanId });
}

function isPublicPublishedEntry(entry) {
  if (!entry) return false;
  return entry.status === "published" && entry.visibility === "public";
}

function getEntityPathById(indexData, id) {
  const entry = getIndexEntryById(indexData, id);
  if (!isPublicPublishedEntry(entry)) return "";
  if (!entry?.path) return "";
  const clean = entry.path.trim().replace(/^\/+/, "");
  return clean.startsWith("data/") ? clean : `data/${clean}`;
}

function closeCategoryModal() {
  const overlay = document.getElementById("categoryModalOverlay");
  if (!overlay) return;
  overlay.classList.remove("active");
  document.body.style.overflow = "";
}

function ensureCategoryModal() {
  let overlay = document.getElementById("categoryModalOverlay");
  if (overlay) return overlay;

  overlay = document.createElement("div");
  overlay.id = "categoryModalOverlay";
  overlay.className = "category-modal-overlay";
  overlay.innerHTML = `
    <div class="category-modal-panel" role="dialog" aria-modal="true" aria-labelledby="categoryModalTitle">
      <button type="button" class="category-modal-close" id="categoryModalClose" aria-label="Cerrar">&times;</button>
      <h3 class="category-modal-title" id="categoryModalTitle"></h3>
      <div class="category-modal-body" id="categoryModalBody"></div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closeCategoryModal();
    }
  });

  overlay.querySelector("#categoryModalClose")?.addEventListener("click", closeCategoryModal);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && overlay.classList.contains("active")) {
      closeCategoryModal();
    }
  });

  return overlay;
}

async function getCategoryIds(categoryKey) {
  const config = CATEGORY_CONFIG[categoryKey];
  if (!config) return [];

  const indexData = await loadIndex();
  const allowedTypes = new Set(config.typeKeys);
  return uniqueStrings(
    getIndexEntries(indexData)
      .filter((entry) => isPublicPublishedEntry(entry) && allowedTypes.has(normalizeEntityType(entry.type)))
      .map((entry) => entry.id)
  );
}

async function getCategoryItems(categoryKey) {
  if (categoryItemsCache.has(categoryKey)) {
    return categoryItemsCache.get(categoryKey);
  }

  const ids = await getCategoryIds(categoryKey);
  const items = await Promise.all(
    ids.map(async (id) => {
      const name = await getEntityName(id);
      return { id, name: name || formatName(id) };
    })
  );

  const sorted = items
    .filter((item) => item.id && item.name)
    .sort((a, b) => a.name.localeCompare(b.name, "es", { sensitivity: "base" }));

  categoryItemsCache.set(categoryKey, sorted);
  return sorted;
}

async function openCategoryList(categoryKey) {
  const config = CATEGORY_CONFIG[categoryKey];
  if (!config) return;

  const overlay = ensureCategoryModal();
  const titleEl = overlay.querySelector("#categoryModalTitle");
  const bodyEl = overlay.querySelector("#categoryModalBody");
  if (!titleEl || !bodyEl) return;

  titleEl.textContent = config.label;
  bodyEl.innerHTML = `<p class="category-modal-status">Cargando ${config.label.toLowerCase()}...</p>`;
  overlay.classList.add("active");
  document.body.style.overflow = "hidden";

  try {
    const items = await getCategoryItems(categoryKey);
    if (items.length === 0) {
      bodyEl.innerHTML = `<p class="category-modal-status">Aun no hay entradas publicadas en esta categoria.</p>`;
      return;
    }

    bodyEl.innerHTML = `
      <ul class="category-modal-list">
        ${items.map((item) => `
          <li>
            <a href="${getEntityHrefById(item.id)}" class="category-modal-link">
              ${escapeHtml(item.name)}
            </a>
          </li>
        `).join("")}
      </ul>
    `;
  } catch (error) {
    console.error("Category modal error:", error);
    bodyEl.innerHTML = `<p class="category-modal-status">No se pudo cargar esta categoria.</p>`;
  }
}

function slugifySectionId(value, fallbackIndex) {
  const base = (value || `section-${fallbackIndex + 1}`)
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || `section-${fallbackIndex + 1}`;
}

function isDesktopOrTablet() {
  return window.matchMedia("(min-width: 768px)").matches;
}

function getAllIdsFromIndex(indexData) {
  return uniqueStrings(
    getIndexEntries(indexData)
      .filter((entry) => isPublicPublishedEntry(entry))
      .map((entry) => entry.id)
  );
}

async function loadIndex() {
  if (indexCache) return indexCache;

  const response = await fetch(INDEX_FILE_PATH, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("No se pudo cargar data/public-index.json.");
  }

  indexCache = (await response.json()) || {};
  return indexCache;
}

async function getEntityById(id) {
  const cleanId = unwrapWikiReference((id || "").toString().trim());
  if (!cleanId) return null;

  if (entityCache.has(cleanId)) {
    return entityCache.get(cleanId);
  }

  const indexData = await loadIndex();
  const entityPath = getEntityPathById(indexData, cleanId);
  if (!entityPath) {
    entityCache.set(cleanId, null);
    return null;
  }

  const response = await fetch(entityPath, { cache: "no-store" });
  if (!response.ok) {
    entityCache.set(cleanId, null);
    return null;
  }

  const payload = await response.json();
  const entity = normalizeEntityData({ id: cleanId, ...payload });
  entityCache.set(cleanId, entity);
  return entity;
}

async function getEntityName(id) {
  const indexData = await loadIndex();
  const indexEntry = getIndexEntryById(indexData, id);
  if (indexEntry?.title) return stripWikiMarkup(indexEntry.title);

  const entity = await getEntityById(id);
  return stripWikiMarkup(entity?.name || formatName(id));
}

function renderHome() {
  const content = document.getElementById("content");
  const sidebar = document.getElementById("sidebar");
  document.body.classList.add("is-home-view");

  sidebar.style.display = "none";
  sidebar.innerHTML = "";

  content.innerHTML = `
    <h1>Cronista del Santuario</h1>

    <p class="home-intro">
      Nimroel no es un mundo. Es una historia que se recuerda. Yo soy el actual Cronista Mayor del Santuario, encargado de cuidar, administrar y legar a todo Nimroel el conocimiento de su historia que se ha ido adquiriendo desde el inicio de las Eras.
    </p>

    <div class="home-grid">
      <a href="javascript:void(0)" onclick="openCategoryList('characters')" class="home-card">
        <img src="assets/images/home/personajes.webp">
        <span>Personajes</span>
      </a>

      <a href="javascript:void(0)" onclick="openCategoryList('locations')" class="home-card">
        <img src="assets/images/home/lugares.webp">
        <span>Lugares</span>
      </a>

      <a href="javascript:void(0)" onclick="openCategoryList('organizations')" class="home-card">
        <img src="assets/images/home/organizaciones.webp">
        <span>Organizaciones</span>
      </a>

      <a href="javascript:void(0)" onclick="openCategoryList('events')" class="home-card">
        <img src="assets/images/home/eventos.webp">
        <span>Eventos</span>
      </a>

      <a href="javascript:void(0)" onclick="openCategoryList('artifacts')" class="home-card">
        <img src="assets/images/home/objetos.webp">
        <span>Objetos</span>
      </a>

      <a href="javascript:void(0)" onclick="openCategoryList('creatures')" class="home-card">
        <picture>
          <source srcset="assets/images/home/criaturas.avif" type="image/avif">
          <source srcset="assets/images/home/criaturas.webp" type="image/webp">
          <img src="assets/images/home/criaturas.webp" alt="Criaturas">
        </picture>
        <span>Criaturas</span>
      </a>
    </div>
  `;
}

function resolveWikiEntityId(label) {
  const cleanLabel = (label || "").toString().trim();
  if (!cleanLabel) return "";
  if (isLikelyEntityId(cleanLabel)) return cleanLabel.toLowerCase();

  return cleanLabel
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

async function parseLinks(text) {
  if (typeof text !== "string" || !text) return "";

  const matches = [...text.matchAll(/\[\[([^[\]]+)\]\]/g)];
  if (matches.length === 0) return text;

  const labelCache = new Map();
  const replacements = await Promise.all(matches.map(async (match) => {
    const token = match?.[1] || "";
    const cleanToken = token.toString().trim();
    if (!cleanToken) return "";

    const hasCustomLabel = cleanToken.includes("|");
    const targetRef = getWikiTargetToken(cleanToken);
    const fallbackLabel = stripWikiMarkup(getWikiDisplayLabel(cleanToken));
    if (!fallbackLabel) return "";

    const entityId = resolveWikiEntityId(targetRef || fallbackLabel);
    const href = getEntityHrefById(entityId || targetRef || fallbackLabel);

    let linkLabel = fallbackLabel;
    if (!hasCustomLabel && entityId) {
      if (!labelCache.has(entityId)) {
        labelCache.set(entityId, getEntityName(entityId).catch(() => ""));
      }
      const resolvedName = await labelCache.get(entityId);
      if (resolvedName) {
        linkLabel = stripWikiMarkup(resolvedName);
      }
    }

    return `<a href="${escapeHtml(href)}">${escapeHtml(linkLabel)}</a>`;
  }));

  let output = "";
  let lastIndex = 0;
  matches.forEach((match, index) => {
    const start = match.index ?? 0;
    output += text.slice(lastIndex, start);
    output += replacements[index];
    lastIndex = start + match[0].length;
  });
  output += text.slice(lastIndex);

  return output;
}

async function renderRichText(targetElement, text) {
  if (!targetElement) return;
  const parsed = await parseLinks(normalizeRichText(text));
  const paragraphs = parsed
    .split(/\n{2,}/)
    .filter(Boolean);

  if (paragraphs.length === 0) {
    targetElement.innerHTML = "";
    return;
  }

  targetElement.innerHTML = paragraphs
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

async function getBacklinks(currentId) {
  const results = [];

  try {
    const indexData = await loadIndex();
    const allIds = getAllIdsFromIndex(indexData);

    for (const id of allIds) {
      if (id === currentId) continue;
      const entity = await getEntityById(id);
      if (!entity) continue;

      if (JSON.stringify(entity).includes(currentId)) {
        results.push(entity.id);
      }
    }
  } catch (error) {
    console.error("Backlinks error:", error);
  }

  return [...new Set(results)];
}

async function renderSidebar(data) {
  const sidebar = document.getElementById("sidebar");

  const aliases = uniqueStrings(data.aliases || []);
  const affiliations = await resolveRelationLabels(data.affiliation || []);
  const birthplaceLabel = data.birthplace
    ? stripWikiMarkup(await getEntityName(data.birthplace))
    : "";

  const relationOrder = ["characters", "locations", "events", "organizations", "others"];
  const relationLabels = {
    characters: "Personajes",
    locations: "Localizaciones",
    events: "Eventos",
    organizations: "Organizaciones",
    others: "Otros"
  };

  const resolvedRelations = {};
  for (const key of relationOrder) {
    resolvedRelations[key] = await resolveRelationLabels((data.relationsByType && data.relationsByType[key]) || []);
  }

  const extraBlocks = [];
  if (data.birthDate) {
    extraBlocks.push(`<p><strong>Fecha de nacimiento:</strong> ${escapeHtml(data.birthDate)}</p>`);
  }
  if (data.deathDate) {
    extraBlocks.push(`<p><strong>Fecha de muerte:</strong> ${escapeHtml(data.deathDate)}</p>`);
  }
  if (aliases.length > 0) {
    extraBlocks.push(`<p><strong>Alias:</strong> ${escapeHtml(aliases.join(", "))}</p>`);
  }
  if (data.race) {
    extraBlocks.push(`<p><strong>Raza:</strong> ${escapeHtml(data.race)}</p>`);
  }

  const relationGroupsHtml = relationOrder
    .map((key) => {
      const items = resolvedRelations[key];
      if (!items || items.length === 0) return "";
      return `
        <div class="sidebar-rel-group">
          <p class="sidebar-rel-label"><strong>${relationLabels[key]}:</strong></p>
          ${renderRelationList(items)}
        </div>
      `;
    })
    .join("");

  const image = data.image || "";
  const avif = image.endsWith(".webp") ? image.replace(".webp", ".avif") : image;

  sidebar.innerHTML = `
    ${image ? `
      <div class="sidebar-infobox-image">
        <picture>
          <source srcset="${avif}" type="image/avif">
          <source srcset="${image}" type="image/webp">
          <img src="${image}" class="clickable" alt="${escapeHtml(data.name || data.id)}">
        </picture>
      </div>
    ` : ""}

    <h2>${escapeHtml(stripWikiMarkup(data.name))}</h2>

    <div class="sidebar-block">
      <p><strong>Tipo:</strong> ${formatType(data.type)}</p>
      ${data.birthplace ? `
        <p><strong>Origen:</strong>
          <a href="${getEntityHrefById(data.birthplace)}">${escapeHtml(birthplaceLabel || formatName(data.birthplace))}</a>
        </p>
      ` : ""}
    </div>

    ${extraBlocks.length > 0 ? `
      <div class="sidebar-block">
        ${extraBlocks.join("")}
      </div>
    ` : ""}

    ${affiliations.length > 0 ? `
      <div class="sidebar-block">
        <p><strong>Afiliacion:</strong></p>
        ${renderRelationList(affiliations)}
      </div>
    ` : ""}

    ${relationGroupsHtml ? `
      <div class="sidebar-block">
        <p class="sidebar-relations-title"><strong>Relaciones</strong></p>
        ${relationGroupsHtml}
      </div>
    ` : ""}

    <div id="backlinks"></div>
  `;

  getBacklinks(data.id).then(async (backlinks) => {
    if (backlinks.length > 0) {
      const backlinkItems = await resolveRelationLabels(backlinks);
      document.getElementById("backlinks").innerHTML = `
        <p><strong>Mencionado en:</strong></p>
        <ul>
          ${backlinkItems.map((item) => `
            <li><a href="${getEntityHrefById(item.id)}">${escapeHtml(item.label || formatName(item.id))}</a></li>
          `).join("")}
        </ul>
      `;
    }
  });
}

function renderContent(data) {
  const content = document.getElementById("content");
  const sidebar = document.getElementById("sidebar");
  document.body.classList.remove("is-home-view");

  sidebar.style.display = "block";

  const sectionsToRender = Array.isArray(data.sections) && data.sections.length > 0
    ? data.sections
    : (data.description
      ? [{ id: "descripcion", title: "Descripcion", text: data.description, order: 0 }]
      : []);

  const showToc = isDesktopOrTablet();
  const usedIds = new Set();
  const preparedSections = sectionsToRender.map((section, index) => {
    const baseSlug = slugifySectionId(section.id || section.title, index);
    let uniqueSlug = baseSlug;
    let suffix = 2;
    while (usedIds.has(uniqueSlug)) {
      uniqueSlug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }
    usedIds.add(uniqueSlug);
    return {
      ...section,
      uiId: `wiki-${uniqueSlug}`
    };
  });

  const tocHtml = (showToc && preparedSections.length > 0)
    ? `
      <nav class="wiki-toc" id="wikiToc" aria-label="Indice de secciones">
        <p class="wiki-toc-title">Indice</p>
        <ul class="wiki-toc-list">
          ${preparedSections.map((section) => `
            <li><a href="#${section.uiId}">${escapeHtml(section.title)}</a></li>
          `).join("")}
        </ul>
      </nav>
    `
    : "";

  content.innerHTML = `
    <div class="breadcrumb">
      <a href="javascript:void(0)" onclick="goHome()">Inicio</a>
      <span> / </span>
      <span class="breadcrumb-current">${escapeHtml(stripWikiMarkup(data.name || formatName(data.id)))}</span>
    </div>

    <h1>${escapeHtml(stripWikiMarkup(data.name || formatName(data.id)))}</h1>

    <div class="content-body">
      <div class="wiki-summary" id="summaryBlock"></div>
      ${tocHtml}
      <div class="wiki-sections" id="sectionsBlock"></div>
    </div>
  `;

  const contentBody = content.querySelector(".content-body");
  const sectionsBlock = document.getElementById("sectionsBlock");
  sidebar.style.display = "block";

  if (showToc) {
    // Desktop/tablet: sidebar behaves like a floating infobox.
    contentBody.prepend(sidebar);
  } else {
    // Mobile: summary first, then sidebar block, then sections.
    contentBody.insertBefore(sidebar, sectionsBlock);
  }

  const summaryBlock = document.getElementById("summaryBlock");
  renderRichText(summaryBlock, data.summary || "");

  preparedSections.forEach((section, index) => {
    const sectionElement = document.createElement("section");
    sectionElement.className = "wiki-section";
    sectionElement.id = section.uiId;

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "wiki-section-toggle";
    toggle.setAttribute("aria-expanded", "true");
    toggle.innerHTML = `
      <span class="wiki-section-title">${escapeHtml(section.title || `Seccion ${index + 1}`)}</span>
      <span class="wiki-section-arrow" aria-hidden="true">&#9652;</span>
    `;
    sectionElement.appendChild(toggle);

    const textElement = document.createElement("div");
    textElement.className = "wiki-section-body wiki-section-text";
    sectionElement.appendChild(textElement);

    toggle.addEventListener("click", () => {
      const expanded = toggle.getAttribute("aria-expanded") === "true";
      const nextExpanded = !expanded;
      toggle.setAttribute("aria-expanded", String(nextExpanded));
      sectionElement.classList.toggle("is-collapsed", !nextExpanded);
      const arrow = toggle.querySelector(".wiki-section-arrow");
      if (arrow) {
        arrow.innerHTML = nextExpanded ? "&#9652;" : "&#9662;";
      }
    });

    sectionsBlock.appendChild(sectionElement);
    renderRichText(textElement, section.text || "");
  });

  renderSidebar(data).catch((error) => {
    console.error("Sidebar render error:", error);
  });
}

async function loadEntity(id) {
  document.body.classList.remove("is-home-view");
  try {
    const entity = await getEntityById(id);
    if (!entity) {
      document.getElementById("content").innerHTML = "<h1>No encontrado</h1>";
      return;
    }
    renderContent(entity);
  } catch (error) {
    console.error("Load entity error:", error);
    document.getElementById("content").innerHTML = "<h1>Error cargando contenido</h1>";
  }
}

function goHome() {
  window.history.pushState({}, "", window.location.pathname);
  renderHome();
}

function filterSection(type) {
  const tree = document.getElementById("tree");
  const sections = tree.querySelectorAll("p, ul");

  sections.forEach(el => { el.style.display = "none"; });

  const labels = {
    characters: "Personajes",
    locations: "Lugares",
    organizations: "Organizaciones",
    creatures: "Criaturas"
  };

  const title = labels[type];

  tree.querySelectorAll("p").forEach((p) => {
    if (p.textContent === title) {
      p.style.display = "block";
      if (p.nextElementSibling) p.nextElementSibling.style.display = "block";
    }
  });
}

async function initSearch() {
  const input = document.getElementById("search");
  const resultsContainer = document.getElementById("searchResults");
  if (!input) return;

  let entities = [];
  try {
    const indexData = await loadIndex();
    const allIds = getAllIdsFromIndex(indexData);

    entities = await Promise.all(
      allIds.map(async (id) => {
        const name = await getEntityName(id);
        return { id, name };
      })
    );
  } catch (error) {
    console.error("Search init error:", error);
  }

  input.addEventListener("input", () => {
    const query = input.value.toLowerCase();
    resultsContainer.innerHTML = "";
    if (!query) return;

    const filtered = entities
      .map((entity) => {
        const name = entity.name.toLowerCase();
        let score = 0;
        if (name.startsWith(query)) score += 3;
        else if (name.includes(query)) score += 1;
        return { ...entity, score };
      })
      .filter(entity => entity.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    for (const item of filtered) {
      const li = document.createElement("li");
      li.innerHTML = `<a href="${getEntityHrefById(item.id)}" class="search-link">${item.name}</a>`;

      resultsContainer.appendChild(li);
    }
  });
}

async function initTree() {
  // Reserved for future tree rendering.
}

document.addEventListener("click", (event) => {
  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.getElementById("lightbox-img");

  if (event.target.classList.contains("clickable")) {
    lightboxImg.src = event.target.src;
    lightbox.classList.add("active");
  }

  if (event.target.id === "lightbox" || event.target.id === "lightbox-img") {
    lightbox.classList.remove("active");
  }
});

window.addEventListener("popstate", () => {
  const id = getIdFromURL();
  if (id) loadEntity(id);
  else renderHome();
});

window.goHome = goHome;
window.filterSection = filterSection;
window.openCategoryList = openCategoryList;

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await loadIndex();
  } catch (error) {
    console.error("Index load error:", error);
  }

  const id = getIdFromURL();
  if (id) {
    await loadEntity(id);
  } else {
    renderHome();
  }

  await initSearch();
  await initTree();
});
