[CmdletBinding()]
param(
    [string]$ServiceAccount = "",
    [string]$PythonExe = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$publisher = Join-Path $repoRoot "tools\wiki_publish\publish_wikis.py"

function Resolve-PythonCommand {
    param([string]$PreferredPath)

    if (-not [string]::IsNullOrWhiteSpace($PreferredPath)) {
        $candidate = $PreferredPath.Trim('"')
        if (Test-Path -LiteralPath $candidate) {
            return $candidate
        }
        throw "Python no encontrado en la ruta indicada: $PreferredPath"
    }

    $envHint = $env:WIKI_PUBLISH_PYTHON
    if (-not [string]::IsNullOrWhiteSpace($envHint)) {
        $candidate = $envHint.Trim('"')
        if (Test-Path -LiteralPath $candidate) {
            return $candidate
        }
    }

    foreach ($knownPath in @(
        (Join-Path $env:LOCALAPPDATA "Programs\Python\Python313\python.exe"),
        (Join-Path $env:LOCALAPPDATA "Programs\Python\Python312\python.exe"),
        (Join-Path $env:LOCALAPPDATA "Programs\Python\Python311\python.exe"),
        (Join-Path $env:LOCALAPPDATA "Programs\Python\Python310\python.exe")
    )) {
        if (Test-Path -LiteralPath $knownPath) {
            return $knownPath
        }
    }

    $pythonCmd = Get-Command python -ErrorAction SilentlyContinue
    if ($pythonCmd) { return "python" }

    $pyLauncher = Get-Command py -ErrorAction SilentlyContinue
    if ($pyLauncher) { return "py" }

    throw "No se encontro Python. Instala Python o configura WIKI_PUBLISH_PYTHON."
}

$pythonCommand = Resolve-PythonCommand -PreferredPath $PythonExe

if (-not [string]::IsNullOrWhiteSpace($ServiceAccount)) {
    & $pythonCommand $publisher --wiki all --service-account $ServiceAccount
} else {
    & $pythonCommand $publisher --wiki all
}

if ($LASTEXITCODE -is [int] -and $LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
exit 0
