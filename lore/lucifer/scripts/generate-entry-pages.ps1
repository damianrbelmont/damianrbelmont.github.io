[CmdletBinding()]
param(
    [string]$LuciferRoot = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($LuciferRoot)) {
    if (-not [string]::IsNullOrWhiteSpace($PSScriptRoot)) {
        $LuciferRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
    } else {
        $LuciferRoot = (Resolve-Path ".\lore\lucifer").Path
    }
}

function Normalize-Text {
    param([AllowNull()][object]$Value)
    if ($null -eq $Value) { return "" }
    return $Value.ToString().Replace("`r`n", "`n").Replace("`r", "`n").Trim()
}

function Escape-Html {
    param([AllowNull()][object]$Value)
    return [System.Net.WebUtility]::HtmlEncode((Normalize-Text $Value))
}

function Get-Slug {
    param([AllowNull()][object]$Value)
    $text = Normalize-Text $Value
    if ([string]::IsNullOrWhiteSpace($text)) { return "" }

    $normalized = $text.Normalize([System.Text.NormalizationForm]::FormD)
    $builder = New-Object System.Text.StringBuilder

    foreach ($ch in $normalized.ToCharArray()) {
        $category = [System.Globalization.CharUnicodeInfo]::GetUnicodeCategory($ch)
        if ($category -ne [System.Globalization.UnicodeCategory]::NonSpacingMark) {
            [void]$builder.Append($ch)
        }
    }

    $ascii = $builder.ToString().ToLowerInvariant()
    $slug = [System.Text.RegularExpressions.Regex]::Replace($ascii, "[^a-z0-9]+", "-").Trim("-")
    return $slug
}

function To-MetaDescription {
    param([AllowNull()][object]$Value, [int]$MaxLength = 160)
    $text = Normalize-Text $Value
    if ([string]::IsNullOrWhiteSpace($text)) { return "" }
    if ($text.Length -le $MaxLength) { return $text }
    return ($text.Substring(0, $MaxLength - 3).TrimEnd() + "...")
}

function Convert-TextToHtml {
    param([AllowNull()][object]$Value)
    $normalized = Normalize-Text $Value
    if ([string]::IsNullOrWhiteSpace($normalized)) { return "" }

    $paragraphs = [System.Text.RegularExpressions.Regex]::Split($normalized, "\n{2,}") |
        ForEach-Object { $_.Trim() } |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
        ForEach-Object {
            $lineHtml = (@($_ -split "`n") | ForEach-Object { Convert-InlineWikiLinks $_ }) -join "<br>"
            "<p>$lineHtml</p>"
        }

    return ($paragraphs -join "`n")
}

function Normalize-TypeLabel {
    param([AllowNull()][object]$Type)
    $map = @{
        character    = "Personaje"
        location     = "Localizacion"
        event        = "Evento"
        concept      = "Concepto"
        organization = "Organizacion"
    }

    $clean = (Normalize-Text $Type).ToLowerInvariant()
    if ($map.ContainsKey($clean)) { return $map[$clean] }
    if ([string]::IsNullOrWhiteSpace($clean)) { return "" }
    return $clean
}

function Build-AbsoluteUrl {
    param(
        [AllowNull()][object]$PathOrUrl,
        [string]$BaseUrl
    )
    $value = Normalize-Text $PathOrUrl
    if ([string]::IsNullOrWhiteSpace($value)) { return "" }
    if ($value -match "^https?://") { return $value }
    $trimmed = $value.TrimStart("/")
    return "$BaseUrl/$trimmed"
}

$baseUrl = "https://damianrbelmont.github.io/lore/lucifer"
$indexPath = Join-Path $LuciferRoot "data/index.json"

if (-not (Test-Path -LiteralPath $indexPath)) {
    throw "No existe data/index.json en $LuciferRoot"
}

$indexData = Get-Content -Raw -Encoding UTF8 -LiteralPath $indexPath | ConvertFrom-Json
$entries = @($indexData.entries)

if ($entries.Count -eq 0) {
    Write-Host "No hay entradas en index.json. Nada que generar."
    exit 0
}

$entryLookup = @{}
foreach ($entry in $entries) {
    $id = Normalize-Text $entry.id
    if (-not [string]::IsNullOrWhiteSpace($id)) {
        $entryLookup[$id] = $entry
    }
}

function Get-EntryHrefById {
    param([AllowNull()][object]$Id)
    $cleanId = Normalize-Text $Id
    if ([string]::IsNullOrWhiteSpace($cleanId)) { return "index.html" }
    if ($entryLookup.ContainsKey($cleanId)) {
        $slug = Normalize-Text $entryLookup[$cleanId].slug
        if (-not [string]::IsNullOrWhiteSpace($slug)) {
            return "$([System.Uri]::EscapeDataString($slug)).html"
        }
    }
    return "index.html?id=$([System.Uri]::EscapeDataString($cleanId))"
}

function Convert-InlineWikiLinks {
    param([AllowNull()][object]$Value)

    $text = Normalize-Text $Value
    if ([string]::IsNullOrWhiteSpace($text)) { return "" }

    $matches = [System.Text.RegularExpressions.Regex]::Matches($text, "\[\[(.*?)\]\]")
    if ($matches.Count -eq 0) {
        return Escape-Html $text
    }

    $builder = New-Object System.Text.StringBuilder
    $currentIndex = 0

    foreach ($match in $matches) {
        $startIndex = $match.Index
        $length = $match.Length

        if ($startIndex -gt $currentIndex) {
            $prefix = $text.Substring($currentIndex, $startIndex - $currentIndex)
            [void]$builder.Append((Escape-Html $prefix))
        }

        $targetId = Normalize-Text $match.Groups[1].Value
        if ([string]::IsNullOrWhiteSpace($targetId)) {
            [void]$builder.Append((Escape-Html $match.Value))
        } else {
            $targetLabel = $targetId
            if ($entryLookup.ContainsKey($targetId)) {
                $entryTitle = Normalize-Text $entryLookup[$targetId].title
                if (-not [string]::IsNullOrWhiteSpace($entryTitle)) {
                    $targetLabel = $entryTitle
                }
            }
            $href = Get-EntryHrefById $targetId
            [void]$builder.Append("<a href=""$(Escape-Html $href)"">$(Escape-Html $targetLabel)</a>")
        }

        $currentIndex = $startIndex + $length
    }

    if ($currentIndex -lt $text.Length) {
        $suffix = $text.Substring($currentIndex)
        [void]$builder.Append((Escape-Html $suffix))
    }

    return $builder.ToString()
}

$generatedCount = 0
$generatedUrls = @()

foreach ($entry in $entries) {
    $status = (Normalize-Text $entry.status).ToLowerInvariant()
    if ([string]::IsNullOrWhiteSpace($status)) { $status = "published" }

    $visibility = (Normalize-Text $entry.visibility).ToLowerInvariant()
    if ([string]::IsNullOrWhiteSpace($visibility)) { $visibility = "public" }

    if ($status -ne "published" -or $visibility -ne "public") {
        continue
    }

    $id = Normalize-Text $entry.id
    if ([string]::IsNullOrWhiteSpace($id)) {
        continue
    }

    $slug = Normalize-Text $entry.slug
    if ([string]::IsNullOrWhiteSpace($slug)) {
        $slug = Get-Slug $id
    }
    if ([string]::IsNullOrWhiteSpace($slug)) {
        continue
    }

    $relativeJsonPath = Normalize-Text $entry.path
    if ([string]::IsNullOrWhiteSpace($relativeJsonPath)) {
        continue
    }

    $jsonPath = Join-Path $LuciferRoot (Join-Path "data" $relativeJsonPath)
    if (-not (Test-Path -LiteralPath $jsonPath)) {
        Write-Warning "No existe JSON para '$id': $jsonPath"
        continue
    }

    $detail = Get-Content -Raw -Encoding UTF8 -LiteralPath $jsonPath | ConvertFrom-Json

    $title = Normalize-Text $detail.title
    if ([string]::IsNullOrWhiteSpace($title)) {
        $title = Normalize-Text $entry.title
    }
    if ([string]::IsNullOrWhiteSpace($title)) {
        $title = $id
    }

    $type = Normalize-Text $detail.type
    if ([string]::IsNullOrWhiteSpace($type)) {
        $type = Normalize-Text $entry.type
    }
    $typeLabel = Normalize-TypeLabel $type

    $section = Normalize-Text $detail.section
    if ([string]::IsNullOrWhiteSpace($section)) {
        $section = Normalize-Text $entry.section
    }

    $subsection = Normalize-Text $detail.subsection
    if ([string]::IsNullOrWhiteSpace($subsection)) {
        $subsection = Normalize-Text $entry.subsection
    }

    $summary = Normalize-Text $detail.content.summary
    $excerpt = Normalize-Text $detail.excerpt
    $description = Normalize-Text $detail.description

    if ([string]::IsNullOrWhiteSpace($excerpt)) {
        $excerpt = $summary
    }
    if ([string]::IsNullOrWhiteSpace($excerpt)) {
        $excerpt = $description
    }

    $seoTitle = Normalize-Text $detail.seo.title
    if ([string]::IsNullOrWhiteSpace($seoTitle)) {
        $seoTitle = "$title | Wiki Lucifer de Damian R Belmont"
    }

    $metaDescription = To-MetaDescription $detail.seo.description
    if ([string]::IsNullOrWhiteSpace($metaDescription)) {
        $metaDescription = To-MetaDescription $excerpt
    }
    if ([string]::IsNullOrWhiteSpace($metaDescription)) {
        $metaDescription = To-MetaDescription $summary
    }
    if ([string]::IsNullOrWhiteSpace($metaDescription)) {
        $metaDescription = To-MetaDescription "Entrada de la wiki del universo de Lucifer de Damian R Belmont."
    }

    $image = Normalize-Text $detail.image
    if ([string]::IsNullOrWhiteSpace($image)) {
        $image = Normalize-Text $entry.image
    }
    if ([string]::IsNullOrWhiteSpace($image)) {
        $image = "assets/images/Lucifer.webp"
    }

    $seoImage = Build-AbsoluteUrl -PathOrUrl $image -BaseUrl $baseUrl
    $canonicalUrl = "$baseUrl/$slug.html"

    $summaryHtml = Convert-TextToHtml $summary
    if ([string]::IsNullOrWhiteSpace($summaryHtml)) {
        $summaryHtml = Convert-TextToHtml $excerpt
    }

    $sections = @()
    if ($null -ne $detail.content -and $null -ne $detail.content.sections) {
        foreach ($rawSection in @($detail.content.sections)) {
            if ($null -eq $rawSection) { continue }
            $sectionText = Normalize-Text $rawSection.text
            if ([string]::IsNullOrWhiteSpace($sectionText)) { continue }
            $sectionTitle = Normalize-Text $rawSection.title
            if ([string]::IsNullOrWhiteSpace($sectionTitle)) {
                $sectionTitle = "Seccion"
            }
            $sections += [pscustomobject]@{
                id    = Normalize-Text $rawSection.id
                title = $sectionTitle
                text  = $sectionText
            }
        }
    }

    if ($sections.Count -eq 0 -and -not [string]::IsNullOrWhiteSpace($description)) {
        $sections += [pscustomobject]@{
            id    = "descripcion"
            title = "Descripcion"
            text  = $description
        }
    }

    $usedSectionIds = @{}
    $tocItems = @()
    $sectionHtmlParts = @()
    $sectionIndex = 1

    foreach ($sectionItem in $sections) {
        $candidateId = Get-Slug $sectionItem.id
        if ([string]::IsNullOrWhiteSpace($candidateId)) {
            $candidateId = Get-Slug $sectionItem.title
        }
        if ([string]::IsNullOrWhiteSpace($candidateId)) {
            $candidateId = "seccion-$sectionIndex"
        }

        $uniqueId = $candidateId
        $suffix = 2
        while ($usedSectionIds.ContainsKey($uniqueId)) {
            $uniqueId = "$candidateId-$suffix"
            $suffix += 1
        }
        $usedSectionIds[$uniqueId] = $true
        $uiId = "wiki-$uniqueId"

        $tocItems += "<li><a href=""#$uiId"">$(Escape-Html $sectionItem.title)</a></li>"
        $sectionBody = Convert-TextToHtml $sectionItem.text
        $sectionHtmlParts += @"
        <section class="wiki-section" id="$uiId">
          <button class="wiki-section-toggle" type="button" aria-expanded="true">
            <h2 class="wiki-section-title">$(Escape-Html $sectionItem.title)</h2>
            <span class="wiki-section-arrow" aria-hidden="true">&#9652;</span>
          </button>
          <div class="wiki-section-body wiki-section-text">
$sectionBody
          </div>
        </section>
"@
        $sectionIndex += 1
    }

    $tocHtml = ""
    if ($tocItems.Count -gt 0) {
        $tocBody = $tocItems -join "`n"
        $tocHtml = @"
      <nav class="wiki-toc" id="wikiToc" aria-label="Indice de secciones">
        <p class="wiki-toc-title">Indice</p>
        <ul class="wiki-toc-list">
$tocBody
        </ul>
      </nav>
"@
    }

    $infoRows = @()
    if (-not [string]::IsNullOrWhiteSpace($typeLabel)) {
        $infoRows += "<p><strong>Tipo:</strong> $(Escape-Html $typeLabel)</p>"
    }
    if (-not [string]::IsNullOrWhiteSpace($section)) {
        $infoRows += "<p><strong>Categoria:</strong> $(Escape-Html $section)</p>"
    }
    if (-not [string]::IsNullOrWhiteSpace($subsection)) {
        $infoRows += "<p><strong>Subcategoria:</strong> $(Escape-Html $subsection)</p>"
    }

    $aliases = @($detail.alias)
    $cleanAliases = @($aliases | ForEach-Object { Normalize-Text $_ } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    if ($cleanAliases.Count -gt 0) {
        $infoRows += "<p><strong>Alias:</strong> $(Escape-Html ($cleanAliases -join ', '))</p>"
    }

    $tags = @($detail.tags)
    $cleanTags = @($tags | ForEach-Object { Normalize-Text $_ } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    if ($cleanTags.Count -gt 0) {
        $infoRows += "<p><strong>Etiquetas:</strong> $(Escape-Html ($cleanTags -join ', '))</p>"
    }

    if ($null -ne $detail.infobox) {
        foreach ($prop in $detail.infobox.PSObject.Properties) {
            $value = Normalize-Text $prop.Value
            if ([string]::IsNullOrWhiteSpace($value)) { continue }
            $label = $prop.Name -creplace "([a-z])([A-Z])", '$1 $2'
            $label = $label.Substring(0, 1).ToUpperInvariant() + $label.Substring(1)
            $infoRows += "<p><strong>$(Escape-Html $label):</strong> $(Escape-Html $value)</p>"
        }
    }

    $sidebarBody = ""
    if ($infoRows.Count -gt 0) {
        $sidebarBody = $infoRows -join "`n"
    } else {
        $sidebarBody = "<p>Entrada del universo de Lucifer de Damian R Belmont.</p>"
    }

    $mainSectionsHtml = $sectionHtmlParts -join "`n"
    $seoContext = "Esta entrada pertenece a la wiki del universo de Lucifer, basada en la novela Lucifer de Damian R Belmont."
    $imageAvif = ""
    if ($detail.PSObject.Properties["imageAvif"]) {
        $imageAvif = Normalize-Text $detail.imageAvif
    } elseif ($detail.PSObject.Properties["media"] -and $null -ne $detail.media -and $detail.media.PSObject.Properties["avif"]) {
        $imageAvif = Normalize-Text $detail.media.avif
    }

    $jsonLdObject = [ordered]@{
        "@context"         = "https://schema.org"
        "@type"            = "Article"
        "headline"         = $title
        "description"      = $metaDescription
        "author"           = [ordered]@{
            "@type" = "Person"
            "name"  = "Damian R Belmont"
        }
        "inLanguage"       = "es"
        "mainEntityOfPage" = $canonicalUrl
        "image"            = $seoImage
        "about"            = "Universo de Lucifer"
    }
    $jsonLd = $jsonLdObject | ConvertTo-Json -Depth 10

    $html = @"
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>$(Escape-Html $seoTitle)</title>
  <meta name="description" content="$(Escape-Html $metaDescription)">
  <meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Damian R Belmont">
  <meta property="og:title" content="$(Escape-Html $seoTitle)">
  <meta property="og:description" content="$(Escape-Html $metaDescription)">
  <meta property="og:url" content="$(Escape-Html $canonicalUrl)">
  <meta property="og:image" content="$(Escape-Html $seoImage)">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="$(Escape-Html $seoTitle)">
  <meta name="twitter:description" content="$(Escape-Html $metaDescription)">
  <meta name="twitter:image" content="$(Escape-Html $seoImage)">
  <link rel="canonical" href="$(Escape-Html $canonicalUrl)">
  <link rel="stylesheet" href="../../css/styles.css">
  <link rel="stylesheet" href="../../css/damian.css">
  <link rel="stylesheet" href="styles.css">
  <script type="application/ld+json">
$jsonLd
  </script>
</head>
<body>
  <header class="site-header">
    <div class="header-container">
      <div class="author-name">
        Damian R.<br>Belmont
      </div>
      <img src="../../assets/images/DRB.png" alt="Firma DRB" class="header-logo">
      <button class="menu-toggle" aria-label="Abrir menu">&#9776;</button>
      <nav class="desktop-nav">
        <ul class="desktop-menu">
          <li><a href="../../index.html">Inicio</a></li>
          <li><a href="../../damian/index.html">Damian</a></li>
          <li><a href="../../novelas/index.html">Novelas</a></li>
          <li><a href="../index.html" class="active-link">Lore</a></li>
          <li><a href="../../novelas/proximamente/index.html">Proximamente</a></li>
        </ul>
      </nav>
    </div>
  </header>

  <nav class="mobile-nav" id="mobileNav">
    <button class="menu-close" aria-label="Cerrar menu">&times;</button>
    <ul class="nav-list">
      <li><a href="../../index.html" class="nav-link">INICIO</a></li>
      <li><a href="../../damian/index.html" class="nav-link">DAMIAN</a></li>
      <li><a href="../../novelas/index.html" class="nav-link">NOVELAS</a></li>
      <li><a href="../index.html" class="nav-link">LORE</a></li>
      <li><a href="../../novelas/proximamente/index.html" class="nav-link">PROXIMAMENTE</a></li>
    </ul>
  </nav>

  <section class="hero">
    <picture>
      <source srcset="assets/images/Hero_Lucifer.webp" media="(min-width: 1024px)">
      <img src="assets/images/Hero_Lucifer.webp" class="hero-img" alt="Lore de Lucifer">
    </picture>
    <div class="hero-overlay"></div>
    <div class="hero-content">
      <h1>Lucifer - Helel Ben Sahar</h1>
    </div>
  </section>

  <div class="layout">
    <main class="center">
      <section class="lore-search-block">
        <h3>Lore</h3>
        <input type="text" id="search" placeholder="Buscar..." autocomplete="off">
        <ul id="searchResults"></ul>
        <div id="tree" class="tree-hidden"></div>
      </section>

      <section id="content">
        <div class="breadcrumb">
          <a href="index.html">Inicio</a>
          <span> / </span>
          <span class="breadcrumb-current">$(Escape-Html $title)</span>
        </div>

        <h1 itemprop="headline">$(Escape-Html $title)</h1>

        <div class="content-body" itemscope itemtype="https://schema.org/Article">
          <aside class="right" id="sidebar">
            $(if ($image) { @"
            <div class="sidebar-infobox-image">
              <picture>
                $(if ($imageAvif) { "<source srcset=""$(Escape-Html $imageAvif)"" type=""image/avif"">" } else { "" })
                $(if ($image.ToLowerInvariant().EndsWith(".webp")) { "<source srcset=""$(Escape-Html $image)"" type=""image/webp"">" } else { "" })
                <img src="$(Escape-Html $image)" class="clickable" alt="$(Escape-Html $title)">
              </picture>
            </div>
"@ } else { "" })
            <h2>$(Escape-Html $title)</h2>
            <div class="sidebar-block">
$sidebarBody
            </div>
          </aside>

          <div class="wiki-summary" id="summaryBlock" itemprop="description">
$summaryHtml
          </div>

$tocHtml

          <div class="wiki-sections" id="sectionsBlock">
$mainSectionsHtml
          </div>
        </div>
      </section>
    </main>
  </div>

  <script src="../../scripts/script.js"></script>
  <script>
    document.addEventListener("DOMContentLoaded", function () {
      document.querySelectorAll(".wiki-section-toggle").forEach(function (toggle) {
        toggle.addEventListener("click", function () {
          var section = toggle.closest(".wiki-section");
          if (!section) return;
          var expanded = toggle.getAttribute("aria-expanded") === "true";
          var nextExpanded = !expanded;
          toggle.setAttribute("aria-expanded", String(nextExpanded));
          section.classList.toggle("is-collapsed", !nextExpanded);
          var arrow = toggle.querySelector(".wiki-section-arrow");
          if (arrow) {
            arrow.innerHTML = nextExpanded ? "&#9652;" : "&#9662;";
          }
        });
      });

      var lightbox = document.getElementById("lightbox");
      var lightboxImg = document.getElementById("lightbox-img");
      document.querySelectorAll(".clickable").forEach(function (img) {
        img.addEventListener("click", function () {
          if (!lightbox || !lightboxImg) return;
          lightboxImg.src = img.src;
          lightbox.classList.add("active");
        });
      });
    });

    document.addEventListener("click", function (event) {
      var lightbox = document.getElementById("lightbox");
      var lightboxImg = document.getElementById("lightbox-img");
      if (!lightbox || !lightboxImg) return;
      if (event.target.id === "lightbox" || event.target.id === "lightbox-img") {
        lightbox.classList.remove("active");
      }
    });
  </script>

  <div id="lightbox" class="lightbox">
    <img id="lightbox-img" alt="Ampliacion">
  </div>

  <footer class="site-footer">
    <div class="footer-links">
      <a href="../../index.html">INICIO</a>
      <a href="../../damian/index.html">DAMIAN</a>
      <a href="../../novelas/index.html">NOVELAS</a>
      <a href="../index.html">LORE</a>
      <a href="../../novelas/proximamente/index.html">PROXIMAMENTE</a>
    </div>
    <div class="social-icons">
      <a href="https://www.instagram.com/damianrbelmont/" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
        <svg class="icon" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"></path>
        </svg>
      </a>
      <a href="https://www.facebook.com/share/1BuDBrXJRR/" target="_blank" rel="noopener noreferrer" aria-label="Facebook">
        <svg class="icon" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
          <path d="M9 8h-3v4h3v12h5v-12h3.642l.358-4h-4v-1.667c0-.955.192-1.333 1.115-1.333h2.885v-5h-3.808c-3.596 0-5.192 1.583-5.192 4.615v3.385z"></path>
        </svg>
      </a>
    </div>
    <div class="footer-legal">
      <p>&copy; 2026 Damian R. Belmont. Ficcion especulativa Â· Todos los derechos reservados</p>
    </div>
  </footer>
</body>
</html>
"@

    $outputPath = Join-Path $LuciferRoot "$slug.html"
    Set-Content -LiteralPath $outputPath -Value $html -Encoding UTF8
    $generatedCount += 1
    $generatedUrls += $canonicalUrl
    Write-Host "Generada: $outputPath"
}

if ($generatedUrls.Count -gt 0) {
    $today = (Get-Date).ToString("yyyy-MM-dd")
    $sitemapEntries = @(
        [pscustomobject]@{ loc = "$baseUrl/index.html"; lastmod = $today },
        [pscustomobject]@{ loc = "$baseUrl/"; lastmod = $today }
    ) + ($generatedUrls | Sort-Object -Unique | ForEach-Object {
        [pscustomobject]@{ loc = $_; lastmod = $today }
    })

    $urlNodes = $sitemapEntries | ForEach-Object {
        @"
  <url>
    <loc>$($_.loc)</loc>
    <lastmod>$($_.lastmod)</lastmod>
  </url>
"@
    }

    $sitemapXml = @"
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
$($urlNodes -join "`n")
</urlset>
"@

    $sitemapPath = Join-Path $LuciferRoot "sitemap.xml"
    Set-Content -LiteralPath $sitemapPath -Value $sitemapXml -Encoding UTF8
    Write-Host "Sitemap actualizado: $sitemapPath"
}

Write-Host "Total paginas generadas: $generatedCount"




