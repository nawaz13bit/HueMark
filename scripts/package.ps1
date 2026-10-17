<#
  Packages HueMark into two store-ready zips:
    dist\huemark-<version>-chrome-edge.zip  (manifest without background.scripts)
    dist\huemark-<version>-firefox.zip      (manifest as-is, scripts + service_worker)
  Edge/Chrome validators reject background.scripts under MV3, while Firefox
  has no background service workers and only reads background.scripts, so the
  shared source manifest keeps both and the Chrome/Edge zip strips it.
  manifest.json ends up at each zip root (Chrome Web Store / AMO reject a
  nested top-level folder), with forward-slash entry paths.
#>

$ErrorActionPreference = "Stop"

$root    = Split-Path -Parent $PSScriptRoot
$version = (Get-Content (Join-Path $root "manifest.json") -Raw | ConvertFrom-Json).version
$distDir = Join-Path $root "dist"

New-Item -ItemType Directory -Force -Path $distDir | Out-Null

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function New-HueMarkZip {
    param([string]$ZipPath, [bool]$StripBackgroundScripts)

    $stage = Join-Path ([System.IO.Path]::GetTempPath()) "huemark-stage-$([guid]::NewGuid())"
    New-Item -ItemType Directory -Force -Path $stage | Out-Null

    $include = @("manifest.json", "src", "vendor", "icons", "_locales", "LICENSE")
    foreach ($item in $include) {
        $src = Join-Path $root $item
        $dst = Join-Path $stage $item
        if (Test-Path $src -PathType Container) {
            Copy-Item -Path $src -Destination $dst -Recurse
        } else {
            Copy-Item -Path $src -Destination $dst
        }
    }

    if ($StripBackgroundScripts) {
        $manifestPath = Join-Path $stage "manifest.json"
        $text = Get-Content $manifestPath -Raw
        # Matches only the quoted "scripts" key, not "content_scripts".
        $text = $text -replace ',\s*"scripts"\s*:\s*\[[^\]]*\]', ''
        $parsed = $text | ConvertFrom-Json
        if ($parsed.background.PSObject.Properties.Name -contains "scripts") {
            throw "Failed to strip background.scripts from the manifest"
        }
        [System.IO.File]::WriteAllText($manifestPath, $text, (New-Object System.Text.UTF8Encoding($false)))
    }

    if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }

    # Build entries manually: Windows PowerShell 5.1's ZipFile.CreateFromDirectory
    # writes backslash path separators, which some store validators reject.
    $zip = [System.IO.Compression.ZipFile]::Open($ZipPath, [System.IO.Compression.ZipArchiveMode]::Create)
    try {
        $files = Get-ChildItem -Path $stage -Recurse -File
        foreach ($file in $files) {
            $relative = $file.FullName.Substring($stage.Length + 1) -replace '\\', '/'
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                $zip, $file.FullName, $relative, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
        }
    } finally {
        $zip.Dispose()
    }

    Remove-Item -Recurse -Force $stage

    $check = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
    $entryCount = $check.Entries.Count
    $backslashCount = ($check.Entries | Where-Object { $_.FullName -match '\\' }).Count
    $check.Dispose()
    if ($backslashCount -gt 0) {
        throw "Zip contains $backslashCount entries with backslash separators"
    }
    Write-Host "Packaged $ZipPath ($entryCount entries, 0 backslash paths)"
}

New-HueMarkZip -ZipPath (Join-Path $distDir "huemark-$version-chrome-edge.zip") -StripBackgroundScripts $true
New-HueMarkZip -ZipPath (Join-Path $distDir "huemark-$version-firefox.zip") -StripBackgroundScripts $false
