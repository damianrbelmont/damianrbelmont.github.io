# Plantillas JSON Canonicas (Lucifer)

Esta carpeta contiene plantillas maestras de estructura para entradas de la wiki de Lucifer.

No contienen contenido narrativo real y no deben publicarse como entradas visibles. Su objetivo es servir de referencia estable para:
- Edicion de entradas
- Render de la wiki
- Generacion futura de HTML por entrada
- Exportacion futura a PDF desde el admin web

## Archivos

- `character.base.json`: esquema base para personajes
- `location.base.json`: esquema base para localizaciones
- `event.base.json`: esquema base para eventos
- `concept.base.json`: esquema base para conceptos/cosmologia

## Contrato canonico comun

Campos obligatorios en los 4 tipos:
- `id`
- `slug`
- `universe` (por defecto: `"lucifer"`)
- `type`
- `section`
- `title`
- `content.summary`
- `content.sections`
- `publication.status`
- `publication.visibility`

Campos opcionales en los 4 tipos:
- `subsection`
- `subtitle`
- `description`
- `image`
- `alias`
- `tags`
- `excerpt`
- `paths.json`
- `paths.url`
- `paths.html`
- `seo.title`
- `seo.description`
- `seo.image`
- `relations`
- `publication.updatedAt`
- `publication.version`

Reglas comunes:
- `title` es el unico campo canonico para nombre principal.
- `name` queda fuera del contrato canonico.
- Se elimina `summary` en top-level.
- `excerpt` se usa para tarjetas/listados.
- `content.summary` se usa dentro de la entrada.
- `paths` y `seo` se mantienen para fases posteriores.
- Cada item de `content.sections` puede incluir opcionalmente `groupTitle` para agrupar varias secciones bajo un mismo encabezado visible en la wiki.
- `groupTitle` es opcional y puede repetirse en varias secciones consecutivas para crear bloques narrativos (ejemplo: "Valak en la novela").

## Relaciones canonicas

El bloque `relations` queda tipado de forma explicita y sin campos ambiguos:
- `characters`
- `locations`
- `events`
- `concepts`
- `organizations`
- `related` (lista auxiliar general)

`relations.entities` se elimina del contrato canonico.

## Publication (enums)

Valores aceptados:
- `publication.status`: `draft` | `published`
- `publication.visibility`: `public` | `private`

## Campos especificos por tipo

Campos de `character.base.json`:
- `infobox`
- `hierarchy`
- `lore`

Campos de `location.base.json`:
- `infobox`
- `hierarchy`
- `lore`
- `environment`

Campos de `event.base.json`:
- `timeline`
- `participants`
- `outcome`
- `infobox`
- `importance`

Campos de `concept.base.json`:
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
