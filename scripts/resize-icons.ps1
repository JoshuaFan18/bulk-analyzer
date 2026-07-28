# Downscales the reference art in icons/ into the 64x64 PNGs the client bundles.
#
# The sources are 1000x1000 (RainbowRune.png alone is 285KB) and every one of
# them is rendered as a ~12-16px inline glyph, so shipping the originals would
# cost roughly 695KB for the 14 icons instead of ~30KB. 64px stays crisp at 2x
# DPI. Run this once when the art changes and COMMIT the output: the client
# `import`s these at build time, so, like client/src/data/powerCosts.json,
# nothing regenerates them on demand and a fresh clone must build without it.
#
#   powershell -ExecutionPolicy Bypass -File scripts/resize-icons.ps1
#
# Only the 14 icons the UI actually uses are copied; the other 14 files in
# icons/ stay put as the art of record.

param(
  [int]$Size = 64
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root 'icons'
$dest = Join-Path $root 'client/src/assets/icons'

# Power / in-text runes (the "2" art), the rainbow (generic and multi-domain),
# the plain domain art (Collection filter chips), and Tap for [rb_exhaust].
$icons = @(
  'Fury2', 'Calm2', 'Mind2', 'Body2', 'Order2', 'Chaos2',
  'RainbowRune',
  'Fury', 'Calm', 'Mind', 'Body', 'Order', 'Chaos',
  'Tap'
)

if (-not (Test-Path $dest)) { New-Item -ItemType Directory -Path $dest | Out-Null }

foreach ($name in $icons) {
  $inPath = Join-Path $src "$name.png"
  $outPath = Join-Path $dest "$name.png"
  if (-not (Test-Path $inPath)) { throw "Missing source icon: $inPath" }

  $image = [System.Drawing.Image]::FromFile($inPath)
  try {
    # 32bpp ARGB, because every icon has a transparent background.
    $bitmap = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
      $g = [System.Drawing.Graphics]::FromImage($bitmap)
      try {
        $g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
        $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $g.DrawImage($image, (New-Object System.Drawing.Rectangle(0, 0, $Size, $Size)))
      } finally { $g.Dispose() }
      $bitmap.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $bitmap.Dispose() }
  } finally { $image.Dispose() }

  $kb = [math]::Round((Get-Item $outPath).Length / 1KB, 1)
  Write-Host "$name.png -> ${Size}x${Size} (${kb}KB)"
}

Write-Host "$($icons.Count) icons written to client/src/assets/icons/"
