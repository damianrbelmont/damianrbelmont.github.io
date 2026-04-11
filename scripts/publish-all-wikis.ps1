[CmdletBinding()]
param(
    [string]$ServiceAccount = ""
)

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$publisher = Join-Path $repoRoot "tools\wiki_publish\publish_wikis.py"

if (-not [string]::IsNullOrWhiteSpace($ServiceAccount)) {
    & python $publisher --wiki all --service-account $ServiceAccount
    exit $LASTEXITCODE
}

& python $publisher --wiki all
exit $LASTEXITCODE
