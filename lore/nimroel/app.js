import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  doc,
  getDoc,
  getFirestore
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

console.log("app.js cargado");

const firebaseConfig = {
  apiKey: "AIzaSyAALd99tyT-ILov22m1G58iforA3f-E628",
  authDomain: "nimroel-wiki.firebaseapp.com",
  projectId: "nimroel-wiki",
  storageBucket: "nimroel-wiki.firebasestorage.app",
  messagingSenderId: "499128220480",
  appId: "1:499128220480:web:e1da6cf1a6f306cd0458a5"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const INDEX_DOC_REF = doc(db, "meta", "index");
const entityCache = new Map();
let indexCache = null;

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
    const clean = (value || "").toString().trim();
    if (clean) set.add(clean);
  });
  return [...set];
}

function extractTextValues(value) {
  return toArray(value).flatMap((item) => {
    if (typeof item === "string" || typeof item === "number") {
      return [item.toString()];
    }
    if (item && typeof item === "object") {
      const candidate = item.id || item.slug || item.ref || item.name || item.title || item.label;
      if (candidate) return [candidate.toString()];
    }
    return [];
  });
}

function getJoinedSectionText(source) {
  const sections = source?.content?.sections;
  if (!Array.isArray(sections)) return "";

  const texts = sections
    .map((section) => (section?.text || "").toString().trim())
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

  // Prefer the new Firebase schema first.
  data.summary = getFirstStringValueFromPaths(raw, [
    "content.summary",
    "content.intro",
    "overview",
    "summary",
    "synopsis",
    "bio"
  ]) || data.summary || "";

  data.description = getFirstStringValueFromPaths(raw, [
    "content.description",
    "content.body",
    "description",
    "details"
  ]) || joinedSections || data.description || "";

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
      const id = (section?.id || `section_${index + 1}`).toString();
      const title = (section?.title || section?.tittle || formatName(id)).toString().trim();
      const text = (section?.text || section?.description || "").toString().trim();
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
          ? `<a href="?id=${encodeURIComponent(item.id)}">${escapeHtml(item.label)}</a>`
          : `<span>${escapeHtml(item.label)}</span>`
        }</li>
      `).join("")}
    </ul>
  `;
}

function getEntityRef(id) {
  return doc(db, "items", id);
}

function getIdFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
}

function formatName(id) {
  return id.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
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

function getAllIdsFromIndex(indexData) {
  if (!indexData || typeof indexData !== "object") return [];

  const idSet = new Set();
  Object.values(indexData).forEach((value) => {
    if (!Array.isArray(value)) return;
    value.forEach((id) => {
      const clean = (id || "").toString().trim();
      if (clean) idSet.add(clean);
    });
  });
  return [...idSet];
}

async function loadIndex() {
  if (indexCache) return indexCache;

  const snap = await getDoc(INDEX_DOC_REF);
  if (!snap.exists()) {
    throw new Error("No existe meta/index en Firestore.");
  }

  indexCache = snap.data() || {};
  return indexCache;
}

async function getEntityById(id) {
  const cleanId = (id || "").toString().trim();
  if (!cleanId) return null;

  if (entityCache.has(cleanId)) {
    return entityCache.get(cleanId);
  }

  const snap = await getDoc(getEntityRef(cleanId));
  if (!snap.exists()) {
    entityCache.set(cleanId, null);
    return null;
  }

  const entity = normalizeEntityData({ id: cleanId, ...snap.data() });
  entityCache.set(cleanId, entity);
  return entity;
}

async function getEntityName(id) {
  const entity = await getEntityById(id);
  return entity?.name || formatName(id);
}

function renderHome() {
  const content = document.getElementById("content");
  const sidebar = document.getElementById("sidebar");

  sidebar.style.display = "none";
  sidebar.innerHTML = "";

  content.innerHTML = `
    <h1>Nimroel</h1>

    <p class="home-intro">
      Nimroel no es un mundo. Es una historia que se recuerda.
    </p>

    <div class="home-grid">
      <a href="javascript:void(0)" onclick="filterSection('characters')" class="home-card">
        <img src="assets/images/home/personajes.webp">
        <span>Personajes</span>
      </a>

      <a href="javascript:void(0)" onclick="filterSection('locations')" class="home-card">
        <img src="assets/images/home/lugares.webp">
        <span>Lugares</span>
      </a>

      <a href="javascript:void(0)" onclick="filterSection('organizations')" class="home-card">
        <img src="assets/images/home/organizaciones.webp">
        <span>Organizaciones</span>
      </a>

      <a href="javascript:void(0)" class="home-card">
        <img src="assets/images/home/eventos.webp">
        <span>Eventos</span>
      </a>

      <a href="javascript:void(0)" class="home-card">
        <img src="assets/images/home/objetos.webp">
        <span>Objetos</span>
      </a>
    </div>
  `;
}

async function parseLinks(text) {
  if (typeof text !== "string" || !text) return "";

  const matches = [...text.matchAll(/\[\[(.*?)\]\]/g)];
  const uniqueIds = [...new Set(matches.map(match => match[1]))];

  let result = text;
  for (const id of uniqueIds) {
    const name = await getEntityName(id);
    result = result.replaceAll(
      `[[${id}]]`,
      `<a href="?id=${id}">${name}</a>`
    );
  }
  return result;
}

async function renderRichText(targetElement, text) {
  if (!targetElement) return;
  const parsed = await parseLinks((text || "").toString());
  const paragraphs = parsed
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
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

  const relationOrder = ["characters", "events", "locations", "organizations", "others"];
  const relationLabels = {
    characters: "Relaciones: Personajes",
    events: "Relaciones: Eventos",
    locations: "Relaciones: Localizaciones",
    organizations: "Relaciones: Organizaciones",
    others: "Relaciones"
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

  sidebar.innerHTML = `
    <h2>${data.name}</h2>

    <div class="sidebar-block">
      <p><strong>Tipo:</strong> ${formatType(data.type)}</p>
      ${data.birthplace ? `
        <p><strong>Origen:</strong>
          <a href="?id=${encodeURIComponent(data.birthplace)}">${escapeHtml(formatName(data.birthplace))}</a>
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

    ${relationOrder.map((key) => {
      const items = resolvedRelations[key];
      if (!items || items.length === 0) return "";
      return `
        <div class="sidebar-block">
          <p><strong>${relationLabels[key]}:</strong></p>
          ${renderRelationList(items)}
        </div>
      `;
    }).join("")}

    <div id="backlinks"></div>
  `;

  getBacklinks(data.id).then((backlinks) => {
    if (backlinks.length > 0) {
      document.getElementById("backlinks").innerHTML = `
        <p><strong>Mencionado en:</strong></p>
        <ul>
          ${backlinks.map(id => `
            <li><a href="?id=${id}">${formatName(id)}</a></li>
          `).join("")}
        </ul>
      `;
    }
  });
}

function renderContent(data) {
  const content = document.getElementById("content");
  const sidebar = document.getElementById("sidebar");

  sidebar.style.display = "block";

  const image = data.image || "";
  const avif = image.endsWith(".webp") ? image.replace(".webp", ".avif") : image;
  const sectionsToRender = Array.isArray(data.sections) && data.sections.length > 0
    ? data.sections
    : (data.description
      ? [{ id: "descripcion", title: "Descripcion", text: data.description, order: 0 }]
      : []);

  content.innerHTML = `
    <div class="breadcrumb">
      <a href="javascript:void(0)" onclick="goHome()">Inicio</a>
      <span> / </span>
      <span class="breadcrumb-current">${data.name || formatName(data.id)}</span>
    </div>

    <h1>${data.name || formatName(data.id)}</h1>

    <div class="content-body">
      ${image ? `
        <div class="image-float">
          <picture>
            <source srcset="${avif}" type="image/avif">
            <source srcset="${image}" type="image/webp">
            <img src="${image}" class="main-image clickable" alt="${data.name || data.id}">
          </picture>
        </div>
      ` : ""}

      <div class="wiki-summary" id="summaryBlock"></div>
      <div class="wiki-sections" id="sectionsBlock"></div>
    </div>
  `;

  const summaryBlock = document.getElementById("summaryBlock");
  renderRichText(summaryBlock, data.summary || "");

  const sectionsBlock = document.getElementById("sectionsBlock");
  sectionsToRender.forEach((section, index) => {
    const sectionElement = document.createElement("section");
    sectionElement.className = "wiki-section";

    const titleElement = document.createElement("h2");
    titleElement.className = "wiki-section-title";
    titleElement.textContent = section.title || `Seccion ${index + 1}`;
    sectionElement.appendChild(titleElement);

    const textElement = document.createElement("div");
    textElement.className = "wiki-section-text";
    sectionElement.appendChild(textElement);

    sectionsBlock.appendChild(sectionElement);
    renderRichText(textElement, section.text || "");
  });

  renderSidebar(data).catch((error) => {
    console.error("Sidebar render error:", error);
  });
}

async function loadEntity(id) {
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
    organizations: "Organizaciones"
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
      li.innerHTML = `<a href="?id=${item.id}" class="search-link">${item.name}</a>`;

      const link = li.querySelector(".search-link");
      link.addEventListener("click", (event) => {
        event.preventDefault();
        window.history.pushState({}, "", `?id=${item.id}`);
        loadEntity(item.id);
        input.value = "";
        resultsContainer.innerHTML = "";
      });

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
