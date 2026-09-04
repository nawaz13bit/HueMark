<#
  Packages HueMark into a store-ready zip (dist\huemark-<version>.zip).
  manifest.json ends up at the zip root (Chrome Web Store / AMO reject a
  nested top-level folder), with forward-slash entry paths.
#>

$ErrorActionPreference = "Stop"

$root    = Split-Path -Parent $PSScriptRoot
$version = (Get-Content (Join-Path $root "manifest.json") -Raw | ConvertFrom-Json).version
$distDir = Join-Path $root "dist"
$stage   = Join-Path ([System.IO.Path]::GetTempPath()) "huemark-stage-$([guid]::NewGuid())"
$zipPath = Join-Path $distDir "huemark-$version.zip"

New-Item -ItemType Directory -Force -Path $distDir | Out-Null
New-Item -ItemType Directory -Force -Path $stage | Out-Null

$include = @("manifest.json", "src", "vendor", "icons", "LICENSE")
foreach ($item in $include) {
    $src = Join-Path $root $item
    $dst = Join-Path $stage $item
    if (Test-Path $src -PathType Container) {
        Copy-Item -Path $src -Destination $dst -Recurse
    } else {
        Copy-Item -Path $src -Destination $dst
    }
}

if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

# Build entries manually: Windows PowerShell 5.1's ZipFile.CreateFromDirectory
# writes backslash path separators, which some store validators reject.
$zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
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

$check = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
$entryCount = $check.Entries.Count
$backslashCount = ($check.Entries | Where-Object { $_.FullName -match '\\' }).Count
$check.Dispose()
if ($backslashCount -gt 0) {
    throw "Zip contains $backslashCount entries with backslash separators"
}
Write-Host "Packaged $zipPath ($entryCount entries, 0 backslash paths)"
