# Re-encrypt an existing identity only after the account holder approves it.
# Never creates/revokes a certificate, prints a secret, or changes the RSA key.
$ErrorActionPreference = 'Stop'
$signingRoot = Join-Path (Split-Path -Parent $PSScriptRoot) '.apple-signing/arcelira'
$opensslPath = 'C:/Program Files/Git/usr/bin/openssl.exe'
$keyPath = Join-Path $signingRoot 'distribution-encrypted.key'
$p12Path = Join-Path $signingRoot 'ArceliraDistribution.p12'
$passwordPath = Join-Path $signingRoot 'distribution-password.dpapi'
$certificatePath = Join-Path $signingRoot 'distribution-certificate.pem'
foreach ($required in @($opensslPath, $keyPath, $p12Path, $passwordPath, $certificatePath)) {
  if (!(Test-Path -LiteralPath $required -PathType Leaf)) { throw 'Existing signing identity is incomplete.' }
}
$rootAcl = Get-Acl -LiteralPath $signingRoot
if (!$rootAcl.AreAccessRulesProtected) { throw 'Signing directory must retain its restricted ACL.' }
$stagingRoot = Join-Path $signingRoot ('protection-rotation-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stagingRoot | Out-Null
$stagedKey = Join-Path $stagingRoot 'distribution-encrypted.key'
$stagedP12 = Join-Path $stagingRoot 'ArceliraDistribution.p12'
$stagedPassword = Join-Path $stagingRoot 'distribution-password.dpapi'
$secretEnvNames = @('ARCELIRA_OLD_WRAP_PASSWORD', 'ARCELIRA_NEW_WRAP_PASSWORD')
$priorEnv = @{}
foreach ($name in $secretEnvNames) { $priorEnv[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
$originals = @($keyPath, $p12Path, $passwordPath)
$replacements = @($stagedKey, $stagedP12, $stagedPassword)
$changed = $false
try {
  $oldSecure = ConvertTo-SecureString ([IO.File]::ReadAllText($passwordPath))
  $oldPassword = (New-Object Net.NetworkCredential('', $oldSecure)).Password
  $randomBytes = New-Object byte[] 48
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($randomBytes) } finally { $generator.Dispose() }
  $newPassword = [Convert]::ToBase64String($randomBytes)
  $env:ARCELIRA_OLD_WRAP_PASSWORD = $oldPassword
  $env:ARCELIRA_NEW_WRAP_PASSWORD = $newPassword
  # Match the original PowerShell stdin export when reading retired material.
  # New wrapping uses an environment value so stdin line endings cannot become
  # part of the password used later on a macOS runner.
  $oldPassword | & $opensslPath pkcs12 -in $p12Path -passin stdin -noout 2>$null
  if ($LASTEXITCODE -ne 0) { throw 'Existing P12 integrity/password check failed.' }
  $certificateModulus = & $opensslPath x509 -in $certificatePath -noout -modulus
  $oldModulus = $oldPassword | & $opensslPath rsa -in $keyPath -passin stdin -noout -modulus 2>$null
  if ($LASTEXITCODE -ne 0 -or $oldModulus -ne $certificateModulus) { throw 'Existing certificate/key mismatch.' }
  $oldPassword | & $opensslPath pkey -in $keyPath -passin stdin -aes-256-cbc -passout env:ARCELIRA_NEW_WRAP_PASSWORD -out $stagedKey 2>$null
  if ($LASTEXITCODE -ne 0) { throw 'Encrypted key rewrapping failed.' }
  & $opensslPath pkcs12 -export -inkey $stagedKey -in $certificatePath -name 'Arcelira Apple Distribution' -passin env:ARCELIRA_NEW_WRAP_PASSWORD -passout env:ARCELIRA_NEW_WRAP_PASSWORD -out $stagedP12 2>$null
  if ($LASTEXITCODE -ne 0) { throw 'Encrypted P12 rewrapping failed.' }
  & $opensslPath pkcs12 -in $stagedP12 -passin env:ARCELIRA_NEW_WRAP_PASSWORD -noout 2>$null
  if ($LASTEXITCODE -ne 0) { throw 'Replacement P12 verification failed.' }
  $newModulus = & $opensslPath rsa -in $stagedKey -passin env:ARCELIRA_NEW_WRAP_PASSWORD -noout -modulus 2>$null
  if ($LASTEXITCODE -ne 0 -or $newModulus -ne $oldModulus) { throw 'Rewrapping must not change the RSA identity.' }
  $newSecure = ConvertTo-SecureString $newPassword -AsPlainText -Force
  [IO.File]::WriteAllText($stagedPassword, (ConvertFrom-SecureString $newSecure))
  # Keep recoverable original bytes, but protect the entire backup with Windows
  # DPAPI so the retired, exposed wrapping password alone cannot unlock it.
  foreach ($original in $originals) {
    $backupPath = Join-Path $stagingRoot ((Split-Path -Leaf $original) + '.retired.dpapi')
    $protected = [Security.Cryptography.ProtectedData]::Protect([IO.File]::ReadAllBytes($original), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    [IO.File]::WriteAllBytes($backupPath, $protected)
  }
  $changed = $true
  for ($i = 0; $i -lt $originals.Count; $i++) { Move-Item -LiteralPath $replacements[$i] -Destination $originals[$i] -Force }
  & $opensslPath pkcs12 -in $p12Path -passin env:ARCELIRA_NEW_WRAP_PASSWORD -noout 2>$null
  if ($LASTEXITCODE -ne 0) { throw 'Installed replacement P12 verification failed.' }
  Write-Output 'Verified new AES-256 wrapping password, unchanged Apple certificate/RSA identity, and DPAPI-protected recovery backups.'
} catch {
  if ($changed) {
    foreach ($original in $originals) {
      $backupPath = Join-Path $stagingRoot ((Split-Path -Leaf $original) + '.retired.dpapi')
      $restored = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($backupPath), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
      [IO.File]::WriteAllBytes($original, $restored)
      [Array]::Clear($restored, 0, $restored.Length)
    }
  }
  throw
} finally {
  foreach ($name in $secretEnvNames) { [Environment]::SetEnvironmentVariable($name, $priorEnv[$name], 'Process') }
  $oldPassword = $null; $newPassword = $null; $oldSecure = $null; $newSecure = $null
}
