# Plantillas JSON Canonicas (Lucifer)

Esta carpeta contiene plantillas maestras de estructura para entradas de la wiki de Lucifer.

No contienen contenido narrativo real y no deben publicarse como entradas visibles. Su objetivo es servir de referencia estable para:
- edicion de entradas
- render de la wiki
- generacion futura de HTML por entrada
- exportacion futura a PDF desde el admin web

## Archivos

- `character.base.json`: esquema base para personajes.
- `location.base.json`: esquema base para localizaciones.
- `event.base.json`: esquema base para eventos.
- `concept.base.json`: esquema base para conceptos/cosmologia.

## Campos comunes (todos los tipos)

Campos obligatorios:
- `id`
- `slug`
- `universe` (valor por defecto: `"lucifer"`)
- `type`
- `section`
- `title` (o `name`, segun flujo editorial; se recomienda mantener ambos sincronizados)

Campos opcionales:
- `subsection`
- `subtitle`
- `summary`
- `description`
- `image`
- `alias`
- `tags`
- `excerpt`
- `paths`
- `seo`
- `relations`
- `content`
- `publication`

Notas:
- `content.summary` y `content.sections` son la base principal de cuerpo de articulo.
- `name`, `summary`, `description` e `image` se conservan tambien para compatibilidad con el render estatico actual.

## Campos especificos por tipo

- Personaje (`character.base.json`):
  - `infobox`
  - `hierarchy`
  - `lore`

- Localizacion (`location.base.json`):
  - `infobox`
  - `hierarchy`
  - `lore`
  - `environment`

- Evento (`event.base.json`):
  - `timeline`
  - `participants`
  - `outcome`
  - `infobox`
  - `importance`

- Concepto/Cosmologia (`concept.base.json`):
  - `principles`
  - `mechanics`
  - `cosmicRole`
  - `infobox`
  - `hierarchy`
  - `lore`
  - `interpretations`

## Regla de uso

Estas plantillas deben usarse como referencia canonica para futuras entradas y para evolucionar el pipeline de admin/render/HTML.  
No deben tratarse como dataset publico de contenido real.
