#!/usr/bin/env pwsh
# Play Store Internal Testing Upload Script
# Prerequisites:
#   1. Service account JSON from Google Play Console (API access)
#   2. gplay CLI installed
#
# Usage:
#   .\upload-play.ps1 -ServiceAccount "C:\path\to\service-account.json"

param(
  [Parameter(Mandatory=$true)]
  [string]$ServiceAccount
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$aab = Join-Path $root "android\app\build\outputs\bundle\release\app-release.aab"
$releaseNotes = Join-Path $root "store-listing\release-notes.json"
$mapping = Join-Path $root "android\app\build\outputs\mapping\release\mapping.txt"

Write-Host "=== DayDial Play Store Upload ===" -ForegroundColor Cyan

# 1. Authenticate
Write-Host "`n[1/5] Authenticating with Play Console..." -ForegroundColor Yellow
gplay auth login --service-account $ServiceAccount --local
if ($LASTEXITCODE -ne 0) { throw "Authentication failed" }

# 2. Validate bundle
Write-Host "`n[2/5] Validating AAB..." -ForegroundColor Yellow
gplay validate bundle --file $aab
if ($LASTEXITCODE -ne 0) { throw "Bundle validation failed" }

# 3. Upload listing metadata + screenshots
Write-Host "`n[3/5] Uploading store listing metadata..." -ForegroundColor Yellow
$editId = gplay edits create --package com.daydial.app | ConvertFrom-Json | Select-Object -ExpandProperty id
gplay listings update --package com.daydial.app --edit $editId --dir (Join-Path $root "metadata")
gplay images upload --package com.daydial.app --edit $editId --locale en-US --type phoneScreenshots --dir (Join-Path $root "metadata\en-US\images\phoneScreenshots")
gplay images upload --package com.daydial.app --edit $editId --locale en-US --type icon --file (Join-Path $root "metadata\en-US\images\icon.png")
gplay images upload --package com.daydial.app --edit $editId --locale en-US --type featureGraphic --file (Join-Path $root "metadata\en-US\images\featureGraphic.png")

# 4. Upload mapping file for crash report deobfuscation
Write-Host "`n[4/5] Uploading ProGuard mapping file..." -ForegroundColor Yellow
gplay deobfuscation upload --package com.daydial.app --edit $editId --apk-version 1 --file $mapping

# 5. Release to internal testing track
Write-Host "`n[5/5] Releasing to internal testing track..." -ForegroundColor Yellow
gplay bundles upload --package com.daydial.app --edit $editId --file $aab
gplay tracks update --package com.daydial.app --edit $editId --track internal --release-notes $releaseNotes
gplay edits validate --package com.daydial.app --edit $editId
gplay edits commit --package com.daydial.app --edit $editId

Write-Host "`n=== Upload Complete! ===" -ForegroundColor Green
Write-Host "Track: internal testing" -ForegroundColor Cyan
Write-Host "Package: com.daydial.app" -ForegroundColor Cyan
Write-Host "Version: 1.0 (versionCode 1)" -ForegroundColor Cyan
