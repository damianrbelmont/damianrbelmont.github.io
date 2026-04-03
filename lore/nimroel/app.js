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

  const entity = { id: cleanId, ...snap.data() };
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

function renderSidebar(data) {
  const sidebar = document.getElementById("sidebar");

  sidebar.innerHTML = `
    <h2>${data.name}</h2>

    <p><strong>Tipo:</strong> ${formatType(data.type)}</p>

    ${data.race ? `<p><strong>Raza:</strong> ${data.race}</p>` : ""}

    ${data.birthplace ? `
      <p><strong>Origen:</strong>
        <a href="?id=${data.birthplace}">${formatName(data.birthplace)}</a>
      </p>
    ` : ""}

    ${data.affiliation ? `
      <p><strong>Afiliacion:</strong></p>
      <ul>
        ${data.affiliation.map(id => `
          <li><a href="?id=${id}">${formatName(id)}</a></li>
        `).join("")}
      </ul>
    ` : ""}

    ${data.related ? `
      <p><strong>Relacionados:</strong></p>
      <ul>
        ${data.related.map(id => `
          <li><a href="?id=${id}">${formatName(id)}</a></li>
        `).join("")}
      </ul>
    ` : ""}

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

      <p>${data.summary || ""}</p>
      <p id="desc"></p>
    </div>
  `;

  parseLinks(data.description || "").then((parsed) => {
    document.getElementById("desc").innerHTML = parsed;
  });

  renderSidebar(data);
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
