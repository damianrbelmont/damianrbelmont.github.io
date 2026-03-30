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
    } catch (e) {}
  }

  document.getElementById("content").innerHTML = "<h1>No encontrado</h1>";
}

// 🔹 Render principal
function renderContent(data) {
  const content = document.getElementById("content");

  content.innerHTML = `
    <h1>${data.name}</h1>
    <p>${data.summary}</p>
    <p id="desc"></p>
    <img src="${data.image}" style="max-width:300px;">
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
    } catch (e) {}
  }

  return formatName(id);
}

// 🔹 Backlinks (temporal con lista manual)
async function getBacklinks(currentId) {
  const results = [];

  const files = ["clarisse", "elowen"]; // ⚠️ temporal

  for (let path of paths) {
    for (let file of files) {
      try {
        const res = await fetch(`${path}${file}.json`);
        if (res.ok) {
          const data = await res.json();

          const text = JSON.stringify(data);

          if (text.includes(currentId) && data.id !== currentId) {
            results.push(data.id);
          }
        }
      } catch (e) {}
    }
  }

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