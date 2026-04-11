[CmdletBinding()]
param(
    [string]$NimroelRoot = ""
)

Set-StrictMode -Version 1
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($NimroelRoot)) {
    if (-not [string]::IsNullOrWhiteSpace($PSScriptRoot)) {
        $NimroelRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
    } else {
        $NimroelRoot = (Resolve-Path ".\lore\nimroel").Path
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

function Normalize-EntityId {
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
    return [System.Text.RegularExpressions.Regex]::Replace($ascii, "[^a-z0-9]+", "_").Trim("_")
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

function Build-TocId {
    param([string]$Raw, [int]$Index)
    $slug = Get-Slug $Raw
    if ([string]::IsNullOrWhiteSpace($slug)) {
        return "section-$($Index + 1)"
    }
    return $slug
}

$publicIndexPath = Join-Path $NimroelRoot "data/public-index.json"
if (-not (Test-Path -LiteralPath $publicIndexPath)) {
    throw "No existe data/public-index.json en $NimroelRoot"
}

$publicIndex = Get-Content -Raw -Encoding UTF8 -LiteralPath $publicIndexPath | ConvertFrom-Json
$entries = @($publicIndex.entries)
if ($entries.Count -eq 0) {
    Write-Host "No hay entradas publicas en Nimroel. Nada que generar."
    exit 0
}

$entryById = @{}
$entryBySlug = @{}
$entryByNameKey = @{}
foreach ($entry in $entries) {
    if ($null -eq $entry) { continue }
    $id = Normalize-Text $entry.id
    if ([string]::IsNullOrWhiteSpace($id)) { continue }
    $slug = Normalize-Text $entry.slug
    if ([string]::IsNullOrWhiteSpace($slug)) {
        $slug = Get-Slug $id
    }
    $title = Normalize-Text $entry.title
    $entityObject = [pscustomobject]@{
        id    = $id
        slug  = $slug
        title = $(if ([string]::IsNullOrWhiteSpace($title)) { $id } else { $title })
    }
    $entryById[$id.ToLowerInvariant()] = $entityObject
    if (-not [string]::IsNullOrWhiteSpace($slug)) {
        $entryBySlug[$slug.ToLowerInvariant()] = $entityObject
    }
    $nameKey = Normalize-EntityId $entityObject.title
    if (-not [string]::IsNullOrWhiteSpace($nameKey) -and -not $entryByNameKey.ContainsKey($nameKey)) {
        $entryByNameKey[$nameKey] = $entityObject
    }
}

function Resolve-EntryByRef {
    param([AllowNull()][object]$Ref)
    $raw = Normalize-Text $Ref
    if ([string]::IsNullOrWhiteSpace($raw)) { return $null }

    $lower = $raw.ToLowerInvariant()
    if ($entryById.ContainsKey($lower)) { return $entryById[$lower] }
    if ($entryBySlug.ContainsKey($lower)) { return $entryBySlug[$lower] }

    $nameKey = Normalize-EntityId $raw
    if (-not [string]::IsNullOrWhiteSpace($nameKey) -and $entryByNameKey.ContainsKey($nameKey)) {
        return $entryByNameKey[$nameKey]
    }
    return $null
}

function Get-EntryHref {
    param([AllowNull()][object]$Ref)
    $entry = Resolve-EntryByRef $Ref
    if ($null -ne $entry -and -not [string]::IsNullOrWhiteSpace($entry.slug)) {
        return "$([System.Uri]::EscapeDataString($entry.slug)).html"
    }
    $id = Normalize-Text $Ref
    if ([string]::IsNullOrWhiteSpace($id)) { return "index.html" }
    return "index.html?id=$([System.Uri]::EscapeDataString($id))"
}

function Convert-InlineWikiLinks {
    param([AllowNull()][object]$Value)
    $text = if ($null -eq $Value) { "" } else { $Value.ToString().Replace("`r`n", "`n").Replace("`r", "`n") }
    if ([string]::IsNullOrWhiteSpace($text)) { return "" }

    $matches = [System.Text.RegularExpressions.Regex]::Matches($text, "\[\[(.*?)\]\]")
    if ($matches.Count -eq 0) {
        return Escape-Html $text
    }

    $builder = New-Object System.Text.StringBuilder
    $currentIndex = 0

    foreach ($match in $matches) {
        if ($match.Index -gt $currentIndex) {
            $prefix = $text.Substring($currentIndex, $match.Index - $currentIndex)
            [void]$builder.Append([System.Net.WebUtility]::HtmlEncode($prefix))
        }

        $token = Normalize-Text $match.Groups[1].Value
        $targetRef = $token
        $visibleLabel = $token
        if ($token -match "^(.*?)\|(.*)$") {
            $targetRef = Normalize-Text $Matches[1]
            $visibleLabel = Normalize-Text $Matches[2]
        }
        if ([string]::IsNullOrWhiteSpace($visibleLabel)) {
            $visibleLabel = $targetRef
        }

        $resolved = Resolve-EntryByRef $targetRef
        if ($null -ne $resolved -and $token -notmatch "\|") {
            $visibleLabel = Normalize-Text $resolved.title
        }
        $href = Get-EntryHref $targetRef
        [void]$builder.Append("<a href=""$(Escape-Html $href)"">$(Escape-Html $visibleLabel)</a>")

        $currentIndex = $match.Index + $match.Length
    }

    if ($currentIndex -lt $text.Length) {
        $suffix = $text.Substring($currentIndex)
        [void]$builder.Append([System.Net.WebUtility]::HtmlEncode($suffix))
    }

    return $builder.ToString()
}

$generated = 0
foreach ($entry in $entries) {
    if ($null -eq $entry) { continue }

    $status = (Normalize-Text $entry.status).ToLowerInvariant()
    if ([string]::IsNullOrWhiteSpace($status)) { $status = "published" }
    $visibility = (Normalize-Text $entry.visibility).ToLowerInvariant()
    if ([string]::IsNullOrWhiteSpace($visibility)) { $visibility = "public" }
    if ($status -ne "published" -or $visibility -ne "public") { continue }

    $id = Normalize-Text $entry.id
    if ([string]::IsNullOrWhiteSpace($id)) { continue }

    $slug = Normalize-Text $entry.slug
    if ([string]::IsNullOrWhiteSpace($slug)) { $slug = Get-Slug $id }
    if ([string]::IsNullOrWhiteSpace($slug)) { continue }

    $relativePath = Normalize-Text $entry.path
    if ([string]::IsNullOrWhiteSpace($relativePath)) { continue }
    $jsonPath = Join-Path $NimroelRoot $relativePath
    if (-not (Test-Path -LiteralPath $jsonPath)) {
        $jsonPath = Join-Path $NimroelRoot (Join-Path "data" $relativePath)
    }
    if (-not (Test-Path -LiteralPath $jsonPath)) {
        Write-Warning "No existe JSON para ${id}: $relativePath"
        continue
    }

    $detail = Get-Content -Raw -Encoding UTF8 -LiteralPath $jsonPath | ConvertFrom-Json
    $title = Normalize-Text $detail.name
    if ([string]::IsNullOrWhiteSpace($title)) { $title = Normalize-Text $detail.title }
    if ([string]::IsNullOrWhiteSpace($title)) { $title = Normalize-Text $entry.title }
    if ([string]::IsNullOrWhiteSpace($title)) { $title = $id }

    $summary = ""
    if ($detail.PSObject.Properties["content"] -and $null -ne $detail.content -and $detail.content.PSObject.Properties["summary"]) {
        $summary = Normalize-Text $detail.content.summary
    }
    if ([string]::IsNullOrWhiteSpace($summary)) { $summary = Normalize-Text $detail.summary }
    if ([string]::IsNullOrWhiteSpace($summary)) { $summary = Normalize-Text $detail.description }

    $sections = @()
    if ($detail.PSObject.Properties["content"] -and $null -ne $detail.content -and $detail.content.PSObject.Properties["sections"]) {
        foreach ($rawSection in @($detail.content.sections)) {
            if ($null -eq $rawSection) { continue }
            $sectionText = Normalize-Text $rawSection.text
            if ([string]::IsNullOrWhiteSpace($sectionText)) { continue }
            $sectionTitle = Normalize-Text $rawSection.title
            if ([string]::IsNullOrWhiteSpace($sectionTitle)) { $sectionTitle = "Seccion" }
            $sections += [pscustomobject]@{
                id    = Normalize-Text $rawSection.id
                title = $sectionTitle
                text  = $sectionText
            }
        }
    }
    if ($sections.Count -eq 0 -and -not [string]::IsNullOrWhiteSpace($detail.description)) {
        $sections += [pscustomobject]@{
            id    = "descripcion"
            title = "Descripcion"
            text  = Normalize-Text $detail.description
        }
    }

    $tocItems = @()
    $sectionHtml = @()
    $usedIds = @{}
    $index = 0
    foreach ($section in $sections) {
        $candidate = Build-TocId -Raw $(if ([string]::IsNullOrWhiteSpace($section.id)) { $section.title } else { $section.id }) -Index $index
        $unique = $candidate
        $suffix = 2
        while ($usedIds.ContainsKey($unique)) {
            $unique = "$candidate-$suffix"
            $suffix += 1
        }
        $usedIds[$unique] = $true
        $uiId = "wiki-$unique"
        $tocItems += "<li><a href=""#$uiId"">$(Escape-Html $section.title)</a></li>"
        $bodyHtml = Convert-TextToHtml $section.text
        $sectionHtml += @"
        <section class="wiki-section" id="$uiId">
          <button class="wiki-section-toggle" type="button" aria-expanded="true">
            <h2 class="wiki-section-title">$(Escape-Html $section.title)</h2>
            <span class="wiki-section-arrow" aria-hidden="true">&#9652;</span>
          </button>
          <div class="wiki-section-body wiki-section-text">
$bodyHtml
          </div>
        </section>
"@
        $index += 1
    }

    $tocHtml = ""
    if ($tocItems.Count -gt 0) {
        $tocHtml = @"
      <nav class="wiki-toc" id="wikiToc" aria-label="Indice de secciones">
        <p class="wiki-toc-title">Indice</p>
        <ul class="wiki-toc-list">
$($tocItems -join "`n")
        </ul>
      </nav>
"@
    }

    $typeLabel = Normalize-Text $detail.type
    $infoRows = @()
    if (-not [string]::IsNullOrWhiteSpace($typeLabel)) { $infoRows += "<p><strong>Tipo:</strong> $(Escape-Html $typeLabel)</p>" }
    if (-not [string]::IsNullOrWhiteSpace($detail.race)) { $infoRows += "<p><strong>Raza:</strong> $(Escape-Html $detail.race)</p>" }
    if (-not [string]::IsNullOrWhiteSpace($detail.birthplace)) {
        $originHref = Get-EntryHref $detail.birthplace
        $originLabel = Normalize-Text $detail.birthplace
        $resolvedOrigin = Resolve-EntryByRef $detail.birthplace
        if ($null -ne $resolvedOrigin) { $originLabel = Normalize-Text $resolvedOrigin.title }
        $infoRows += "<p><strong>Origen:</strong> <a href=""$(Escape-Html $originHref)"">$(Escape-Html $originLabel)</a></p>"
    }
    if ($infoRows.Count -eq 0) {
        $infoRows += "<p>Entrada del archivo de Nimroel.</p>"
    }

    $image = Normalize-Text $detail.image
    $imageAvif = if ($image.ToLowerInvariant().EndsWith(".webp")) { $image.Substring(0, $image.Length - 5) + ".avif" } else { "" }
    $summaryHtml = Convert-TextToHtml $summary
    $mainSections = $sectionHtml -join "`n"

    $outputPath = Join-Path $NimroelRoot "$slug.html"
    $html = @"
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>$(Escape-Html $title) | Nimroel Lore</title>
  <meta name="description" content="$(Escape-Html $summary)">
  <link rel="stylesheet" href="../../css/styles.css">
  <link rel="stylesheet" href="../../css/damian.css">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <header class="site-header">
    <div class="header-container">
      <div class="author-name">Damian R.<br>Belmont</div>
      <img src="../../assets/images/DRB.png" alt="Firma DRB" class="header-logo">
      <nav class="desktop-nav">
        <ul class="desktop-menu">
          <li><a href="/">Inicio</a></li>
          <li><a href="/damian/">Damian</a></li>
          <li><a href="/novelas/">Novelas</a></li>
          <li><a href="/novelas/proximamente/">Próximamente</a></li>
        </ul>
      </nav>
    </div>
  </header>

  <section class="hero">
    <picture>
      <source srcset="assets/images/hero/hero.avif" type="image/avif">
      <source srcset="assets/images/hero/hero.webp" type="image/webp">
      <img src="assets/images/hero/hero.webp" class="hero-img" alt="Nimroel">
    </picture>
    <div class="hero-overlay"></div>
    <div class="hero-content"><h1>Las Crónicas de Nimroel</h1></div>
  </section>

  <div class="layout">
    <main class="center">
      <section id="content">
        <div class="breadcrumb">
          <a href="index.html">Inicio</a>
          <span> / </span>
          <span class="breadcrumb-current">$(Escape-Html $title)</span>
        </div>
        <h1>$(Escape-Html $title)</h1>
        <div class="content-body">
          <aside class="right" id="sidebar">
            $(if (-not [string]::IsNullOrWhiteSpace($image)) { @"
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
$($infoRows -join "`n")
            </div>
          </aside>

          <div class="wiki-summary" id="summaryBlock">
$summaryHtml
          </div>
$tocHtml
          <div class="wiki-sections" id="sectionsBlock">
$mainSections
          </div>
        </div>
      </section>
    </main>
  </div>

  <div id="lightbox" class="lightbox">
    <img id="lightbox-img" alt="Ampliacion">
  </div>

  <script>
    document.addEventListener("DOMContentLoaded", function () {
      document.querySelectorAll(".wiki-section-toggle").forEach(function (toggle) {
        toggle.addEventListener("click", function () {
          var section = toggle.closest(".wiki-section");
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

      document.addEventListener("click", function (event) {
        var lightbox = document.getElementById("lightbox");
        var lightboxImg = document.getElementById("lightbox-img");
        if (event.target.classList.contains("clickable")) {
          lightboxImg.src = event.target.src;
          lightbox.classList.add("active");
        }
        if (event.target.id === "lightbox" || event.target.id === "lightbox-img") {
          lightbox.classList.remove("active");
        }
      });
    });
  </script>
</body>
</html>
"@

    [System.IO.File]::WriteAllText($outputPath, $html, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "Generada: $outputPath"
    $generated += 1
}

Write-Host "Total paginas generadas (Nimroel): $generated"
