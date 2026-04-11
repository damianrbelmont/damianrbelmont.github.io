# Sistema Hibrido de Publicacion (Lucifer + Nimroel)

## Objetivo

- Firebase se mantiene como fuente de edicion (admins).
- GitHub Pages sirve HTML estatico para publico.
- Las visitas publicas no leen Firestore en tiempo real.

## Estructura de publicacion

- Publicador comun: `tools/wiki_publish/publish_wikis.py`
- Config por wiki:
  - `tools/wiki_publish/config_lucifer.json`
  - `tools/wiki_publish/config_nimroel.json`
- Comandos rapidos:
  - `scripts/publish-lucifer.ps1`
  - `scripts/publish-nimroel.ps1`
  - `scripts/publish-all-wikis.ps1`

## Service Account

1. Crea o descarga una Service Account con permisos de lectura en Firestore.
2. Guarda el JSON fuera del repo, por ejemplo:
   - `C:\Users\andro\secrets\firebase-service-account.json`
3. Usa una de estas opciones:
   - Variable de entorno: `FIREBASE_SERVICE_ACCOUNT`
   - Parametro CLI: `--service-account "C:\ruta\service-account.json"`

## Instalacion previa

```powershell
python -m pip install -r C:\Users\andro\Documents\GitHub\damianrbelmont.github.io\requirements-wiki-publish.txt
```

Opcional (para no pasar `-ServiceAccount` en cada ejecucion):

```powershell
$env:FIREBASE_SERVICE_ACCOUNT = "C:\Users\andro\secrets\firebase-service-account.json"
```

## Publicar una wiki

### Lucifer

```powershell
.\scripts\publish-lucifer.ps1 -ServiceAccount "C:\Users\andro\secrets\firebase-service-account.json"
```

### Nimroel

```powershell
.\scripts\publish-nimroel.ps1 -ServiceAccount "C:\Users\andro\secrets\firebase-service-account.json"
```

## Publicar ambas

```powershell
.\scripts\publish-all-wikis.ps1 -ServiceAccount "C:\Users\andro\secrets\firebase-service-account.json"
```

## Que hace el publicador

1. Lee Firestore (coleccion + indice) una vez por wiki.
2. Sincroniza JSON publicos locales en `lore/<wiki>/data`.
3. Genera HTML estatico por entrada.
4. Actualiza indices locales:
   - Lucifer: `lore/lucifer/data/index.json`
   - Nimroel: `lore/nimroel/data/index.json` y `lore/nimroel/data/public-index.json`
   - Solo se exportan entradas `published` + `public`
5. Elimina huerfanos:
   - JSON en `lore/<wiki>/data/**` que ya no existan en Firebase
   - HTML de entrada en `lore/<wiki>/*.html` cuyo slug ya no este publicado
6. Deja lista la carpeta para `git add`, `git commit`, `git push`.

## Notas de configuracion

- Lucifer usa por defecto:
  - coleccion: `lucifer_items`
  - indice: `meta_lucifer/index`
- Nimroel usa por defecto:
  - coleccion: `items`
  - indice: `meta/index`
- Puedes ajustar esos valores en los `config_*.json`.

## Flujo diario recomendado

1. Editar contenido en admin (Firebase).
2. Ejecutar publicador (una wiki o ambas).
3. Revisar cambios locales.
4. Publicar en GitHub.
