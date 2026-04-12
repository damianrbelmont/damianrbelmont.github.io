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

function Repair-Mojibake {
    param([AllowNull()][object]$Value)
    if ($null -eq $Value) { return "" }
    $text = $Value.ToString()
    if ([string]::IsNullOrWhiteSpace($text)) { return $text }

    if ($text -notmatch '[\xC2\xC3\xE2\uFFFD]') {
        return $text
    }

    $current = $text
    for ($i = 0; $i -lt 3; $i++) {
        if ($current -notmatch '[\xC2\xC3\xE2\uFFFD]') {
            break
        }

        try {
            $latin1 = [System.Text.Encoding]::GetEncoding("ISO-8859-1")
            $bytes = $latin1.GetBytes($current)
            $next = [System.Text.Encoding]::UTF8.GetString($bytes)
        } catch {
            break
        }

        if ([string]::IsNullOrWhiteSpace($next) -or $next -eq $current) {
            break
        }
        $current = $next
    }

    return $current
}

function Normalize-Text {
    param(
        [AllowNull()][object]$Value,
        [switch]$NoTrim
    )
    if ($null -eq $Value) { return "" }
    $text = Repair-Mojibake $Value
    $text = $text.Replace("`r`n", "`n").Replace("`r", "`n")
    if ($NoTrim) { return $text }
    return $text.Trim()
}

function Escape-Html {
    param([AllowNull()][object]$Value)
    return [System.Net.WebUtility]::HtmlEncode((Normalize-Text $Value))
}

function Escape-TextWithAllowedInlineTags {
    param([AllowNull()][object]$Value)
    $encoded = [System.Net.WebUtility]::HtmlEncode((Normalize-Text $Value -NoTrim))

    $allowed = @{
        "&lt;i&gt;" = "<i>"
        "&lt;/i&gt;" = "</i>"
        "&lt;em&gt;" = "<em>"
        "&lt;/em&gt;" = "</em>"
        "&lt;b&gt;" = "<b>"
        "&lt;/b&gt;" = "</b>"
        "&lt;strong&gt;" = "<strong>"
        "&lt;/strong&gt;" = "</strong>"
        "&lt;br&gt;" = "<br>"
        "&lt;br/&gt;" = "<br>"
        "&lt;br /&gt;" = "<br>"
    }

    foreach ($pair in $allowed.GetEnumerator()) {
        $encoded = $encoded.Replace($pair.Key, $pair.Value)
    }
    return $encoded
}

function Normalize-Reference {
    param([AllowNull()][object]$Value)
    $text = Normalize-Text $Value
    if ([string]::IsNullOrWhiteSpace($text)) { return "" }

    if ($text -match "^\[\[(.*?)\]\]$") {
        $text = Normalize-Text $Matches[1]
    }

    if ($text -match "^(.*?)\|(.*)$") {
        $text = Normalize-Text $Matches[1]
    }
    return $text
}

function Normalize-EntityId {
    param([AllowNull()][object]$Value)
    $text = Normalize-Reference $Value
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

function Get-Slug {
    param([AllowNull()][object]$Value)
    $text = Normalize-Reference $Value
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

function Build-TocId {
    param([string]$Raw, [int]$Index)
    $slug = Get-Slug $Raw
    if ([string]::IsNullOrWhiteSpace($slug)) {
        return "section-$($Index + 1)"
    }
    return $slug
}

function Get-PropValue {
    param(
        [AllowNull()][object]$Object,
        [string]$Path
    )
    if ($null -eq $Object -or [string]::IsNullOrWhiteSpace($Path)) { return $null }

    $current = $Object
    foreach ($part in ($Path -split "\.")) {
        if ($null -eq $current) { return $null }

        if ($current -is [System.Collections.IList]) {
            $index = 0
            if (-not [int]::TryParse($part, [ref]$index)) {
                return $null
            }
            if ($index -lt 0 -or $index -ge $current.Count) {
                return $null
            }
            $current = $current[$index]
            continue
        }

        $prop = $current.PSObject.Properties[$part]
        if ($null -eq $prop) { return $null }
        $current = $prop.Value
    }

    return $current
}

function Get-FirstText {
    param(
        [AllowNull()][object]$Object,
        [string[]]$Paths
    )
    foreach ($path in $Paths) {
        $value = Normalize-Text (Get-PropValue -Object $Object -Path $path)
        if (-not [string]::IsNullOrWhiteSpace($value)) {
            return $value
        }
    }
    return ""
}

function To-RefArray {
    param([AllowNull()][object]$Value)
    if ($null -eq $Value) { return @() }
    if ($Value -is [System.Collections.IList] -and -not ($Value -is [string])) {
        return @($Value)
    }
    return @($Value)
}

function Convert-ToNormalizedRefList {
    param([AllowNull()][object]$Value)
    $seen = @{}
    $result = @()

    foreach ($item in (To-RefArray $Value)) {
        $candidate = ""
        if ($item -is [string] -or $item -is [int] -or $item -is [double] -or $item -is [bool]) {
            $candidate = Normalize-Reference $item
        } elseif ($null -ne $item -and $item.PSObject) {
            $candidate = Get-FirstText $item @("id", "slug", "ref", "name", "title", "label", "value")
            $candidate = Normalize-Reference $candidate
        }

        if ([string]::IsNullOrWhiteSpace($candidate)) { continue }
        $key = $candidate.ToLowerInvariant()
        if ($seen.ContainsKey($key)) { continue }
        $seen[$key] = $true
        $result += $candidate
    }

    return $result
}

function Format-FieldLabel {
    param([AllowNull()][object]$Name)
    $text = Normalize-Text $Name
    if ([string]::IsNullOrWhiteSpace($text)) { return "" }
    $text = $text -replace "_", " "
    $text = $text -replace "-", " "
    $text = $text -replace "([a-z])([A-Z])", '$1 $2'
    $text = [System.Text.RegularExpressions.Regex]::Replace($text, "\s+", " ").Trim()
    if ([string]::IsNullOrWhiteSpace($text)) { return "" }
    return $text.Substring(0, 1).ToUpperInvariant() + $text.Substring(1)
}

function Format-ReferenceLabel {
    param([AllowNull()][object]$Value)
    $raw = Normalize-Reference $Value
    if ([string]::IsNullOrWhiteSpace($raw)) { return "" }

    $pretty = $raw -replace "_", " " -replace "-", " "
    $pretty = [System.Text.RegularExpressions.Regex]::Replace($pretty, "\s+", " ").Trim()
    if ([string]::IsNullOrWhiteSpace($pretty)) { return $raw }

    $parts = @()
    foreach ($part in ($pretty -split " ")) {
        if ([string]::IsNullOrWhiteSpace($part)) { continue }
        $parts += ($part.Substring(0, 1).ToUpperInvariant() + $part.Substring(1))
    }
    if ($parts.Count -eq 0) { return $raw }
    return ($parts -join " ")
}

$indexPath = Join-Path $NimroelRoot "data/index.json"
if (-not (Test-Path -LiteralPath $indexPath)) {
    throw "No existe data/index.json en $NimroelRoot"
}

$indexData = Get-Content -Raw -Encoding UTF8 -LiteralPath $indexPath | ConvertFrom-Json
$entries = @()

if ($indexData.PSObject.Properties["entries"] -and $indexData.entries -is [System.Collections.IList]) {
    $entries = @($indexData.entries)
}

if ($entries.Count -eq 0) {
    $ids = New-Object System.Collections.Generic.HashSet[string]([System.StringComparer]::OrdinalIgnoreCase)
    foreach ($prop in $indexData.PSObject.Properties) {
        $value = $prop.Value
        if (-not ($value -is [System.Collections.IList]) -or ($value -is [string])) {
            continue
        }
        foreach ($item in @($value)) {
            $id = Normalize-Reference $item
            if ([string]::IsNullOrWhiteSpace($id)) { continue }
            [void]$ids.Add($id)
        }
    }

    if ($ids.Count -gt 0) {
        $dataRoot = Join-Path $NimroelRoot "data"
        $jsonFiles = Get-ChildItem -Path $dataRoot -Recurse -File -Filter "*.json" |
            Where-Object { $_.Name -ne "index.json" }

        foreach ($id in $ids) {
            $match = $jsonFiles | Where-Object { $_.BaseName -ieq $id } | Select-Object -First 1
            if ($null -eq $match) { continue }

            $relative = $match.FullName.Substring($dataRoot.Length).TrimStart("\", "/").Replace("\", "/")
            $payload = Get-Content -Raw -Encoding UTF8 -LiteralPath $match.FullName | ConvertFrom-Json
            $status = Normalize-Text (Get-PropValue $payload "publication.status")
            if ([string]::IsNullOrWhiteSpace($status)) { $status = "published" }
            $visibility = Normalize-Text (Get-PropValue $payload "publication.visibility")
            if ([string]::IsNullOrWhiteSpace($visibility)) { $visibility = "public" }

            $entries += [pscustomobject]@{
                id = $id
                slug = Get-FirstText $payload @("slug")
                title = Get-FirstText $payload @("title", "name", "meta.title")
                type = Get-FirstText $payload @("type")
                section = ""
                subsection = ""
                excerpt = Get-FirstText $payload @("content.summary", "summary", "meta.description", "description")
                image = Get-FirstText $payload @("image", "meta.image")
                path = $relative
                status = $status
                visibility = $visibility
            }
        }
    }
}

if ($entries.Count -eq 0) {
    Write-Host "No hay entradas publicas en data/index.json. Nada que generar."
    exit 0
}

$entryById = @{}
$entryBySlug = @{}
$entryByNameKey = @{}
foreach ($entry in $entries) {
    if ($null -eq $entry) { continue }
    $id = Normalize-Reference $entry.id
    if ([string]::IsNullOrWhiteSpace($id)) { continue }
    $slug = Normalize-Text $entry.slug
    if ([string]::IsNullOrWhiteSpace($slug)) {
        $slug = Get-Slug $id
    }
    $title = Normalize-Text $entry.title
    if ([string]::IsNullOrWhiteSpace($title)) {
        $title = $id
    }

    $entityObject = [pscustomobject]@{
        id    = $id
        slug  = $slug
        title = $title
    }

    $entryById[$id.ToLowerInvariant()] = $entityObject
    if (-not [string]::IsNullOrWhiteSpace($slug)) {
        $entryBySlug[$slug.ToLowerInvariant()] = $entityObject
    }
    $nameKey = Normalize-EntityId $title
    if (-not [string]::IsNullOrWhiteSpace($nameKey) -and -not $entryByNameKey.ContainsKey($nameKey)) {
        $entryByNameKey[$nameKey] = $entityObject
    }
}

function Resolve-EntryByRef {
    param([AllowNull()][object]$Ref)
    $raw = Normalize-Reference $Ref
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
    $raw = Normalize-Reference $Ref
    $entry = Resolve-EntryByRef $raw
    if ($null -ne $entry -and -not [string]::IsNullOrWhiteSpace($entry.slug)) {
        return "$([System.Uri]::EscapeDataString($entry.slug)).html"
    }
    if ([string]::IsNullOrWhiteSpace($raw)) { return "index.html" }
    return "index.html?id=$([System.Uri]::EscapeDataString($raw))"
}

function Get-EntryDisplayLabel {
    param([AllowNull()][object]$Ref)
    $raw = Normalize-Reference $Ref
    if ([string]::IsNullOrWhiteSpace($raw)) { return "" }
    $resolved = Resolve-EntryByRef $raw
    if ($null -ne $resolved) {
        return Normalize-Text $resolved.title
    }
    return Format-ReferenceLabel $raw
}

function Convert-InlineWikiLinks {
    param([AllowNull()][object]$Value)
    $text = Normalize-Text $Value -NoTrim
    if ([string]::IsNullOrWhiteSpace($text)) { return "" }

    $matches = [System.Text.RegularExpressions.Regex]::Matches($text, "\[\[(.*?)\]\]")
    if ($matches.Count -eq 0) {
        return Escape-TextWithAllowedInlineTags $text
    }

    $builder = New-Object System.Text.StringBuilder
    $currentIndex = 0

    foreach ($match in $matches) {
        if ($match.Index -gt $currentIndex) {
            $prefix = $text.Substring($currentIndex, $match.Index - $currentIndex)
            [void]$builder.Append((Escape-TextWithAllowedInlineTags $prefix))
        }

        $token = Normalize-Text $match.Groups[1].Value
        $targetRef = $token
        $visibleLabel = $token
        if ($token -match "^(.*?)\|(.*)$") {
            $targetRef = Normalize-Reference $Matches[1]
            $visibleLabel = Normalize-Text $Matches[2]
        }
        if ([string]::IsNullOrWhiteSpace($visibleLabel)) {
            $visibleLabel = Normalize-Reference $targetRef
        }

        $resolved = Resolve-EntryByRef $targetRef
        if ($null -ne $resolved -and $token -notmatch "\|") {
            $visibleLabel = Normalize-Text $resolved.title
        } elseif (-not ($token -match "\|")) {
            $visibleLabel = Format-ReferenceLabel $targetRef
        }

        $href = Get-EntryHref $targetRef
        [void]$builder.Append("<a href=""$(Escape-Html $href)"">$(Escape-Html $visibleLabel)</a>")
        $currentIndex = $match.Index + $match.Length
    }

    if ($currentIndex -lt $text.Length) {
        $suffix = $text.Substring($currentIndex)
        [void]$builder.Append((Escape-TextWithAllowedInlineTags $suffix))
    }

    return $builder.ToString()
}

function Convert-TextToHtml {
    param([AllowNull()][object]$Value)
    $normalized = Normalize-Text $Value -NoTrim
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

function Normalize-Type {
    param([AllowNull()][object]$Value)
    $clean = (Normalize-Text $Value).ToLowerInvariant()
    $aliases = @{
        "characters" = "character"
        "personaje" = "character"
        "personajes" = "character"
        "locations" = "location"
        "lugar" = "location"
        "lugares" = "location"
        "localizacion" = "location"
        "localizaciones" = "location"
        "organizations" = "organization"
        "organizacion" = "organization"
        "organizaciones" = "organization"
        "events" = "event"
        "evento" = "event"
        "eventos" = "event"
        "artifacts" = "artifact"
        "artefacto" = "artifact"
        "artefactos" = "artifact"
        "creatures" = "creature"
        "criatura" = "creature"
        "criaturas" = "creature"
        "concepts" = "concept"
        "concepto" = "concept"
        "conceptos" = "concept"
    }
    if ($aliases.ContainsKey($clean)) { return $aliases[$clean] }
    return $clean
}

function Format-TypeLabel {
    param([AllowNull()][object]$Value)
    $normalized = Normalize-Type $Value
    $labels = @{
        "character" = "Personaje"
        "location" = "Localizacion"
        "organization" = "Organizacion"
        "event" = "Evento"
        "artifact" = "Artefacto"
        "creature" = "Criatura"
        "concept" = "Concepto"
    }
    if ($labels.ContainsKey($normalized)) { return $labels[$normalized] }
    return Format-FieldLabel $normalized
}

function Render-RefList {
    param([string[]]$Refs)
    if ($null -eq $Refs -or $Refs.Count -eq 0) { return "" }
    $items = $Refs | ForEach-Object {
        $label = Get-EntryDisplayLabel $_
        $href = Get-EntryHref $_
        "<li><a href=""$(Escape-Html $href)"">$(Escape-Html $label)</a></li>"
    }
    return "<ul class=""sidebar-list"">`n$($items -join "`n")`n</ul>"
}

function Add-ScalarRowsFromObject {
    param(
        [AllowNull()][object]$Object,
        [string[]]$ExcludeKeys,
        [hashtable]$Rows,
        [string]$Prefix = ""
    )
    if ($null -eq $Object -or -not $Object.PSObject) { return }

    $excluded = @{}
    foreach ($key in ($ExcludeKeys | ForEach-Object { (Normalize-Text $_).ToLowerInvariant() })) {
        if (-not [string]::IsNullOrWhiteSpace($key)) { $excluded[$key] = $true }
    }

    foreach ($prop in $Object.PSObject.Properties) {
        $name = Normalize-Text $prop.Name
        if ([string]::IsNullOrWhiteSpace($name)) { continue }
        $nameLower = $name.ToLowerInvariant()
        if ($excluded.ContainsKey($nameLower)) { continue }

        $value = $prop.Value
        if ($null -eq $value) { continue }
        if ($value -is [System.Collections.IList] -and -not ($value -is [string])) { continue }
        if ($value.PSObject -and -not ($value -is [string])) { continue }

        $cleanValue = Normalize-Text $value
        if ([string]::IsNullOrWhiteSpace($cleanValue)) { continue }

        $labelKey = if ([string]::IsNullOrWhiteSpace($Prefix)) { $nameLower } else { "$($Prefix.ToLowerInvariant()).$nameLower" }
        if ($Rows.ContainsKey($labelKey)) { continue }

        $label = if ([string]::IsNullOrWhiteSpace($Prefix)) {
            Format-FieldLabel $name
        } else {
            "$(Format-FieldLabel $Prefix): $(Format-FieldLabel $name)"
        }
        $Rows[$labelKey] = "<p><strong>$(Escape-Html $label):</strong> $(Escape-Html $cleanValue)</p>"
    }
}

$generated = 0
foreach ($entry in $entries) {
    if ($null -eq $entry) { continue }

    $status = (Normalize-Text $entry.status).ToLowerInvariant()
    if ([string]::IsNullOrWhiteSpace($status)) { $status = "published" }
    $visibility = (Normalize-Text $entry.visibility).ToLowerInvariant()
    if ([string]::IsNullOrWhiteSpace($visibility)) { $visibility = "public" }
    if ($status -ne "published" -or $visibility -ne "public") { continue }

    $id = Normalize-Reference $entry.id
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

    $detailText = Normalize-Text (Get-Content -Raw -Encoding UTF8 -LiteralPath $jsonPath) -NoTrim
    $detail = $detailText | ConvertFrom-Json

    $title = Get-FirstText $detail @("name", "title", "meta.title")
    if ([string]::IsNullOrWhiteSpace($title)) { $title = Normalize-Text $entry.title }
    if ([string]::IsNullOrWhiteSpace($title)) { $title = $id }

    $typeLabel = Format-TypeLabel (Get-FirstText $detail @("type"))
    if ([string]::IsNullOrWhiteSpace($typeLabel)) {
        $typeLabel = Format-TypeLabel (Get-FirstText $entry @("type"))
    }

    $summary = Get-FirstText $detail @("content.summary", "summary", "meta.description", "description")
    $description = Get-FirstText $detail @("description", "content.description", "content.body")
    if ([string]::IsNullOrWhiteSpace($description)) {
        $description = Get-FirstText $detail @("meta.description")
    }

    $sections = @()
    $rawSections = Get-PropValue $detail "content.sections"
    if ($rawSections -is [System.Collections.IList] -and -not ($rawSections -is [string])) {
        foreach ($rawSection in @($rawSections)) {
            if ($null -eq $rawSection) { continue }

            $sectionText = Get-FirstText $rawSection @("text", "description", "body", "content", "value")
            if ([string]::IsNullOrWhiteSpace($sectionText)) { continue }

            $sectionTitle = Get-FirstText $rawSection @("title", "name", "heading")
            if ([string]::IsNullOrWhiteSpace($sectionTitle)) { $sectionTitle = "Seccion" }

            $sections += [pscustomobject]@{
                id         = Get-FirstText $rawSection @("id", "slug")
                title      = $sectionTitle
                text       = $sectionText
                groupTitle = Get-FirstText $rawSection @("groupTitle", "group", "sectionGroupTitle")
            }
        }
    }

    if ($sections.Count -eq 0 -and -not [string]::IsNullOrWhiteSpace($description)) {
        $sections += [pscustomobject]@{
            id         = "descripcion"
            title      = "Descripcion"
            text       = $description
            groupTitle = ""
        }
    }

    $tocItems = @()
    $sectionHtml = @()
    $usedIds = @{}
    $index = 0
    $lastGroupTitle = ""

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
        $groupTitle = Normalize-Text $section.groupTitle
        $groupHeadingHtml = ""
        if (-not [string]::IsNullOrWhiteSpace($groupTitle) -and $groupTitle -ne $lastGroupTitle) {
            $groupHeadingHtml = @"
        <h2 class="wiki-section-group-title">$(Escape-Html $groupTitle)</h2>
"@
            $lastGroupTitle = $groupTitle
        }

        $sectionHtml += @"
$groupHeadingHtml
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

    $rows = @{}
    if (-not [string]::IsNullOrWhiteSpace($typeLabel)) {
        $rows["type"] = "<p><strong>Tipo:</strong> $(Escape-Html $typeLabel)</p>"
    }

    $race = Get-FirstText $detail @("race", "extra.race")
    if (-not [string]::IsNullOrWhiteSpace($race)) {
        $rows["race"] = "<p><strong>Raza:</strong> $(Escape-Html $race)</p>"
    }

    $birth = Get-FirstText $detail @("birth", "birthDate", "extra.birth")
    if (-not [string]::IsNullOrWhiteSpace($birth)) {
        $rows["birth"] = "<p><strong>Nacimiento:</strong> $(Escape-Html $birth)</p>"
    }

    $death = Get-FirstText $detail @("death", "deathDate", "extra.death")
    if (-not [string]::IsNullOrWhiteSpace($death)) {
        $rows["death"] = "<p><strong>Fallecimiento:</strong> $(Escape-Html $death)</p>"
    }

    $birthplaceRef = Get-FirstText $detail @("birthplace", "origin", "extra.birthplace", "extra.origin")
    if (-not [string]::IsNullOrWhiteSpace($birthplaceRef)) {
        $originHref = Get-EntryHref $birthplaceRef
        $originLabel = Get-EntryDisplayLabel $birthplaceRef
        $rows["origin"] = "<p><strong>Origen:</strong> <a href=""$(Escape-Html $originHref)"">$(Escape-Html $originLabel)</a></p>"
    }

    Add-ScalarRowsFromObject -Object (Get-PropValue $detail "extra") `
        -ExcludeKeys @("race", "birth", "death", "affiliation", "birthplace", "origin") `
        -Rows $rows `
        -Prefix "Extra"

    Add-ScalarRowsFromObject -Object $detail `
        -ExcludeKeys @("id", "slug", "name", "title", "type", "summary", "description", "image", "content", "meta", "relations", "related", "race", "birth", "birthDate", "death", "deathDate", "birthplace", "origin", "affiliation", "alias", "aliases", "tags", "extra") `
        -Rows $rows

    $infoRows = @($rows.Values)
    if ($infoRows.Count -eq 0) {
        $infoRows = @("<p>Entrada del archivo de Nimroel.</p>")
    }

    $aliases = Convert-ToNormalizedRefList @((Get-PropValue $detail "alias"), (Get-PropValue $detail "aliases"))
    $tags = Convert-ToNormalizedRefList (Get-PropValue $detail "tags")
    $affiliations = Convert-ToNormalizedRefList @((Get-PropValue $detail "affiliation"), (Get-PropValue $detail "extra.affiliation"))
    $relatedOthers = Convert-ToNormalizedRefList (Get-PropValue $detail "related")

    $relationBuckets = [ordered]@{
        characters = Convert-ToNormalizedRefList (Get-PropValue $detail "relations.characters")
        locations = Convert-ToNormalizedRefList (Get-PropValue $detail "relations.locations")
        organizations = Convert-ToNormalizedRefList (Get-PropValue $detail "relations.organizations")
        events = Convert-ToNormalizedRefList (Get-PropValue $detail "relations.events")
        artifacts = Convert-ToNormalizedRefList (Get-PropValue $detail "relations.artifacts")
        creatures = Convert-ToNormalizedRefList (Get-PropValue $detail "relations.creatures")
        concepts = Convert-ToNormalizedRefList (Get-PropValue $detail "relations.concepts")
        others = $relatedOthers
    }

    $relationLabels = @{
        characters = "Personajes"
        locations = "Localizaciones"
        organizations = "Organizaciones"
        events = "Eventos"
        artifacts = "Objetos"
        creatures = "Criaturas"
        concepts = "Conceptos"
        others = "Otros"
    }

    $metaDescription = Get-FirstText $detail @("meta.description")
    $summaryHtml = Convert-TextToHtml $summary
    $mainSections = $sectionHtml -join "`n"

    $image = Get-FirstText $detail @("image", "meta.image")
    $imageAvif = if ($image.ToLowerInvariant().EndsWith(".webp")) { $image.Substring(0, $image.Length - 5) + ".avif" } else { "" }
    $outputPath = Join-Path $NimroelRoot "$slug.html"

    $aliasBlockHtml = ""
    if ($aliases.Count -gt 0) {
        $aliasBlockHtml = "<div class=""sidebar-block""><p><strong>Alias:</strong> $(Escape-Html ($aliases -join ", "))</p></div>"
    }

    $tagsBlockHtml = ""
    if ($tags.Count -gt 0) {
        $tagsBlockHtml = "<div class=""sidebar-block""><p><strong>Etiquetas:</strong> $(Escape-Html ($tags -join ", "))</p></div>"
    }

    $affiliationBlockHtml = ""
    if ($affiliations.Count -gt 0) {
        $affiliationList = Render-RefList $affiliations
        $affiliationBlockHtml = @"
            <div class="sidebar-block">
              <p><strong>Afiliacion:</strong></p>
$affiliationList
            </div>
"@
    }

    $relationGroupsHtml = @()
    foreach ($bucketName in $relationBuckets.Keys) {
        $refs = @($relationBuckets[$bucketName])
        if ($refs.Count -eq 0) { continue }
        $listHtml = Render-RefList $refs
        $relationGroupsHtml += @"
              <div class="sidebar-rel-group">
                <p class="sidebar-rel-label"><strong>$($relationLabels[$bucketName]):</strong></p>
$listHtml
              </div>
"@
    }

    $relationsBlockHtml = ""
    if ($relationGroupsHtml.Count -gt 0) {
        $relationsBlockHtml = @"
            <div class="sidebar-block">
              <p class="sidebar-relations-title"><strong>Relaciones</strong></p>
$($relationGroupsHtml -join "`n")
            </div>
"@
    }

    $contextBlockHtml = ""
    if (-not [string]::IsNullOrWhiteSpace($metaDescription) -and $metaDescription -ne $summary) {
        $contextBlockHtml = @"
          <div class="wiki-entry-context">
            $(Convert-TextToHtml $metaDescription)
          </div>
"@
    }

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
          <li><a href="/novelas/proximamente/">Pr&oacute;ximamente</a></li>
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
    <div class="hero-content"><h1>Las Cr&oacute;nicas de Nimroel</h1></div>
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
$aliasBlockHtml
$tagsBlockHtml
$affiliationBlockHtml
$relationsBlockHtml
          </aside>

          <div class="wiki-summary" id="summaryBlock">
$summaryHtml
          </div>
$contextBlockHtml
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
