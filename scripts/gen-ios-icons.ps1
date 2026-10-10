$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $projectRoot 'store-listing\icon-master.png'
$outputPath = Join-Path $projectRoot 'ios\App\App\Assets.xcassets\AppIcon.appiconset\AppIcon-512@2x.png'

if (-not (Test-Path -LiteralPath $sourcePath)) { throw 'Approved Arcelira icon master is missing.' }
if (-not (Test-Path -LiteralPath (Split-Path -Parent $outputPath))) { throw 'Create the iOS project first.' }

$source = [System.Drawing.Image]::FromFile($sourcePath)
$bitmap = New-Object System.Drawing.Bitmap(1024, 1024, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try {
    # Store icons must be opaque. Preserve the approved artwork on white.
    $graphics.Clear([System.Drawing.Color]::White)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.DrawImage($source, 0, 0, 1024, 1024)
    $bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Output "Created opaque 1024x1024 Arcelira iOS icon: $outputPath"
} finally {
    $graphics.Dispose()
    $bitmap.Dispose()
    $source.Dispose()
}
