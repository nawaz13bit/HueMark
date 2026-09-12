<#
  Chrome Web Store / Edge Add-ons require screenshots at exactly 1280x800
  (or 640x400), 16:10 ratio. Source captures are 1920x1020 (1.882:1) -
  wider than 16:10, so we pad height (letterbox bars, sampled from the
  image's own top-left corner color) rather than crop width, to avoid
  cutting off the HueMark panel on the right edge of the captures.
#>

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$srcDir = Join-Path $root "screenshots"
$outDir = Join-Path $srcDir "store"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$targetW = 1280
$targetH = 800
$targetRatio = $targetW / $targetH

Get-ChildItem -Path $srcDir -Filter "0*.png" | ForEach-Object {
    $src = [System.Drawing.Image]::FromFile($_.FullName)
    $srcRatio = $src.Width / $src.Height

    if ($srcRatio -gt $targetRatio) {
        # source is wider than target -> pad height
        $canvasW = $src.Width
        $canvasH = [int][Math]::Round($src.Width / $targetRatio)
    } else {
        # source is taller than target -> pad width
        $canvasH = $src.Height
        $canvasW = [int][Math]::Round($src.Height * $targetRatio)
    }

    $bmp = New-Object System.Drawing.Bitmap $canvasW, $canvasH
    $bmp.SetResolution($src.HorizontalResolution, $src.VerticalResolution)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

    $srcBmp = New-Object System.Drawing.Bitmap $src
    $cornerColor = $srcBmp.GetPixel(2, 2)
    $brush = New-Object System.Drawing.SolidBrush $cornerColor
    $g.FillRectangle($brush, 0, 0, $canvasW, $canvasH)

    $offsetX = [int](($canvasW - $src.Width) / 2)
    $offsetY = [int](($canvasH - $src.Height) / 2)
    $g.DrawImage($src, $offsetX, $offsetY, $src.Width, $src.Height)

    $final = New-Object System.Drawing.Bitmap $targetW, $targetH
    $gFinal = [System.Drawing.Graphics]::FromImage($final)
    $gFinal.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $gFinal.DrawImage($bmp, 0, 0, $targetW, $targetH)

    $outPath = Join-Path $outDir $_.Name
    $final.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)

    $g.Dispose(); $gFinal.Dispose(); $bmp.Dispose(); $final.Dispose(); $srcBmp.Dispose(); $src.Dispose()
    Write-Host "$($_.Name): $($canvasW)x$($canvasH) padded -> ${targetW}x${targetH}"
}