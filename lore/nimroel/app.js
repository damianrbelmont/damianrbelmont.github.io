console.log("app.js cargado");

// 🔹 Rutas base
const paths = [
  "data/characters/",
  "data/locations/",
  "data/organizations/"
];

// 🔹 Cargar entidad
async function loadEntity(id) {
  for (let path of paths) {
    try {
      const res = await fetch(`${path}${id}.json`);
      if (res.ok) {
        const data = await res.json();
        renderContent(data);
        return;
      }
    } catch (e) { }
  }

  document.getElementById("content").innerHTML = "<h1>No encontrado</h1>";
}

// 🔹 Render principal
function renderContent(data) {
  const content = document.getElementById("content");

  content.innerHTML = `
  <h1>${data.name}</h1>

  <div class="content-body">

    <div class="image-float">
      <picture>
        <source srcset="${data.image.split('.').slice(0, -1).join('.')}.avif" type="image/avif">
        <source srcset="${data.image}" type="image/webp">
        <img src="${data.image}" class="main-image clickable" alt="${data.name}">
      </picture>
    </div>

    <p>${data.summary}</p>
    <p id="desc"></p>

  </div>
`;

  // Links dinámicos
  parseLinks(data.description).then(parsed => {
    document.getElementById("desc").innerHTML = parsed;
  });

  renderSidebar(data);
}

// 🔹 Sidebar completa (incluye backlinks)
function renderSidebar(data) {
  const sidebar = document.getElementById("sidebar");

  sidebar.innerHTML = `
    <h2>${data.name}</h2>

    <p><strong>Tipo:</strong> ${formatType(data.type)}</p>

    ${data.race ? `<p><strong>Raza:</strong> ${data.race}</p>` : ""}

    ${data.birthplace ? `
      <p><strong>Origen:</strong> 
        <a href="?id=${data.birthplace}">
          ${formatName(data.birthplace)}
        </a>
      </p>
    ` : ""}

    ${data.affiliation ? `
      <p><strong>Afiliación:</strong></p>
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

  // 🔥 Backlinks (dinámicos)
  getBacklinks(data.id).then(backlinks => {
    if (backlinks.length > 0) {
      const html = `
        <p><strong>Mencionado en:</strong></p>
        <ul>
          ${backlinks.map(id => `
            <li><a href="?id=${id}">${formatName(id)}</a></li>
          `).join("")}
        </ul>
      `;

      document.getElementById("backlinks").innerHTML = html;
    }
  });
}

// 🔹 Parsear [[links]]
async function parseLinks(text) {
  const matches = [...text.matchAll(/\[\[(.*?)\]\]/g)];

  let result = text;

  for (let match of matches) {
    const id = match[1];
    const name = await getEntityName(id);

    result = result.replace(
      `[[${id}]]`,
      `<a href="?id=${id}">${name}</a>`
    );
  }

  return result;
}

// 🔹 Obtener nombre real
async function getEntityName(id) {
  for (let path of paths) {
    try {
      const res = await fetch(`${path}${id}.json`);
      if (res.ok) {
        const data = await res.json();
        return data.name;
      }
    } catch (e) { }
  }

  return formatName(id);
}

// 🔹 Backlinks (temporal con lista manual)
async function getBacklinks(currentId) {
  const results = [];

  try {
    const res = await fetch("data/index.json");
    const index = await res.json();

    const allIds = [
      ...(index.characters || []),
      ...(index.locations || []),
      ...(index.organizations || [])
    ];

    for (let id of allIds) {
      if (id === currentId) continue;

      for (let path of paths) {
        try {
          const res = await fetch(`${path}${id}.json`);
          if (res.ok) {
            const data = await res.json();

            const text = JSON.stringify(data);

            if (text.includes(currentId)) {
              results.push(data.id);
            }
          }
        } catch (e) { }
      }
    }
  } catch (e) { }

  return [...new Set(results)];
}

// 🔹 Formatear nombre
function formatName(id) {
  return id
    .replace(/_/g, " ")
    .replace(/\b\w/g, l => l.toUpperCase());
}

// 🔹 Tipos bonitos
function formatType(type) {
  const types = {
    character: "Personaje",
    location: "Lugar",
    organization: "Organización",
    event: "Evento",
    artifact: "Artefacto",
    creature: "Criatura"
  };

  return types[type] || type;
}

// 🔹 URL
function getIdFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id") || "clarisse";
}

// 🔹 Init
loadEntity(getIdFromURL());

initSearch();

async function initSearch() {
  const input = document.getElementById("search");
  const resultsContainer = document.getElementById("searchResults");

  if (!input) return;

  // 🔹 Cargar index
  const res = await fetch("data/index.json");
  const index = await res.json();

  const allIds = [
    ...(index.characters || []),
    ...(index.locations || []),
    ...(index.organizations || [])
  ];

  // 🔹 Obtener nombres reales
  const entities = [];

  for (let id of allIds) {
    const name = await getEntityName(id);
    entities.push({ id, name });
  }

  // 🔹 Evento de búsqueda
  input.addEventListener("input", () => {
    const query = input.value.toLowerCase();

    resultsContainer.innerHTML = "";

    if (!query) return;

    const filtered = entities
      .map(e => {
        const name = e.name.toLowerCase();

        let score = 0;

        if (name.startsWith(query)) score += 3;
        else if (name.includes(query)) score += 1;

        return { ...e, score };
      })
      .filter(e => e.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    for (let item of filtered) {
      const li = document.createElement("li");
      li.innerHTML = `<a href="?id=${item.id}">${item.name}</a>`;
      li.addEventListener("click", () => {
        input.value = "";
        resultsContainer.innerHTML = "";
      });
      resultsContainer.appendChild(li);
    }
  });
}

initTree();

async function initTree() {
  const container = document.getElementById("tree");
  if (!container) return;

  const res = await fetch("data/index.json");
  const index = await res.json();

  const sections = [
    { key: "characters", label: "Personajes" },
    { key: "locations", label: "Lugares" },
    { key: "organizations", label: "Organizaciones" }
  ];

  let html = "";

  for (let section of sections) {
    const ids = index[section.key] || [];

    if (ids.length === 0) continue;

    html += `<p><strong>${section.label}</strong></p><ul>`;

    const items = [];

    for (let id of ids) {
      const name = await getEntityName(id);
      items.push({ id, name });
    }

    // ordenar por nombre
    items.sort((a, b) => a.name.localeCompare(b.name));

    for (let item of items) {
      html += `<li><a href="?id=${item.id}">${item.name}</a></li>`;
    }

    html += `</ul>`;
  }

  container.innerHTML = html;
}


// =========================================
// LIGHTBOX IMÁGENES
// =========================================

document.addEventListener("click", (e) => {
  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.getElementById("lightbox-img");

  // Abrir lightbox
  if (e.target.classList.contains("clickable")) {
    lightboxImg.src = e.target.src;
    lightbox.classList.add("active");
  }

  // Cerrar lightbox (click fuera o en la imagen)
  if (e.target.id === "lightbox" || e.target.id === "lightbox-img") {
    lightbox.classList.remove("active");
  }
});