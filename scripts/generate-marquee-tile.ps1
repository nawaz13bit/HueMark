<#
  Generates the optional Chrome Web Store marquee promo tile
  (1400x560), matching the small promo tile's dark-tile + diagonal
  3-stripe motif + wordmark, scaled up with extra breathing room.
#>

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$outPath = Join-Path $root "screenshots\marquee-tile-1400x560.png"

$W = 1400
$H = 560

$bmp = New-Object System.Drawing.Bitmap $W, $H
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

# Background
$bgColor = [System.Drawing.Color]::FromArgb(255, 26, 27, 30)
$g.FillRectangle((New-Object System.Drawing.SolidBrush $bgColor), 0, 0, $W, $H)

# Rounded tile (icon motif), left side, vertically centered
$tileSize = 360
$tileX = 100
$tileY = [int](($H - $tileSize) / 2)
$tileColor = [System.Drawing.Color]::FromArgb(255, 42, 43, 47)
$radius = 60

function Add-RoundedRect($path, $x, $y, $w, $h, $r) {
    $path.AddArc($x, $y, $r, $r, 180, 90)
    $path.AddArc($x + $w - $r, $y, $r, $r, 270, 90)
    $path.AddArc($x + $w - $r, $y + $h - $r, $r, $r, 0, 90)
    $path.AddArc($x, $y + $h - $r, $r, $r, 90, 90)
    $path.CloseFigure()
}

$tilePath = New-Object System.Drawing.Drawing2D.GraphicsPath
Add-RoundedRect $tilePath $tileX $tileY $tileSize $tileSize $radius

$region = New-Object System.Drawing.Region $tilePath
$g.SetClip([System.Drawing.Region]$region, [System.Drawing.Drawing2D.CombineMode]::Replace)
$g.FillPath((New-Object System.Drawing.SolidBrush $tileColor), $tilePath)

# Diagonal stripes clipped to the tile
$stripeColors = @(
    [System.Drawing.Color]::FromArgb(255, 250, 204, 21),
    [System.Drawing.Color]::FromArgb(255, 56, 189, 248),
    [System.Drawing.Color]::FromArgb(255, 244, 114, 182)
)
$stripeWidth = 55
$gap = 28
$startX = $tileX - 80
for ($i = 0; $i -lt $stripeColors.Count; $i++) {
    $offset = $i * ($stripeWidth + $gap)
    $pts = @(
        New-Object System.Drawing.Point ($startX + $offset), ($tileY + $tileSize + 60)
        New-Object System.Drawing.Point ($startX + $offset + $stripeWidth), ($tileY + $tileSize + 60)
        New-Object System.Drawing.Point ($startX + $offset + $stripeWidth + $tileSize + 120), ($tileY - 60)
        New-Object System.Drawing.Point ($startX + $offset + $tileSize + 120), ($tileY - 60)
    )
    $g.FillPolygon((New-Object System.Drawing.SolidBrush $stripeColors[$i]), $pts)
}
$g.ResetClip()

# Wordmark
$textX = $tileX + $tileSize + 80
$titleFont = New-Object System.Drawing.Font("Segoe UI", 54, [System.Drawing.FontStyle]::Bold)
$titleBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
$g.DrawString("HueMark", $titleFont, $titleBrush, $textX, ($H / 2 - 90))

$subFont = New-Object System.Drawing.Font("Segoe UI", 26, [System.Drawing.FontStyle]::Regular)
$subBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 170, 173, 179))
$g.DrawString("Multi-color highlighting", $subFont, $subBrush, $textX, ($H / 2 + 5))
$g.DrawString("for pages & PDFs", $subFont, $subBrush, $textX, ($H / 2 + 42))

$bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Host "Saved $outPath (${W}x${H})"