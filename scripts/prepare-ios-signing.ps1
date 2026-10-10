param(
  [ValidateSet('request', 'export')]
  [string]$Mode = 'request',
  [string]$CertificatePath
)

# Local credential artifacts only; never print private keys or passwords.
# Run only after the account holder approves a new distribution certificate.
$ErrorActionPreference = 'Stop'
$signingRoot = Join-Path (Split-Path -Parent $PSScriptRoot) '.apple-signing/arcelira'
$opensslPath = 'C:/Program Files/Git/usr/bin/openssl.exe'
if (!(Test-Path -LiteralPath $opensslPath)) { throw 'Git OpenSSL is required.' }
if (!(Test-Path -LiteralPath $signingRoot)) {
  New-Item -ItemType Directory -Path $signingRoot | Out-Null
}

# Disable inherited access only for this newly created credential directory.
# Keep the current user and SYSTEM, not broad Users/Everyone groups.
$ownerIdentity = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$systemIdentity = New-Object System.Security.Principal.SecurityIdentifier('S-1-5-18')
$credentialAcl = New-Object System.Security.AccessControl.DirectorySecurity
$credentialAcl.SetOwner($ownerIdentity)
$credentialAcl.SetAccessRuleProtection($true, $false)
foreach ($identity in @($ownerIdentity, $systemIdentity)) {
  $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
    $identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'
  )
  $credentialAcl.AddAccessRule($rule)
}
$existingAcl = Get-Acl -LiteralPath $signingRoot
$existingRules = @($existingAcl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]))
$allowedOwners = @($ownerIdentity.Value, $systemIdentity.Value)
$unexpectedRules = @($existingRules | Where-Object {
  $_.IdentityReference.Value -notin $allowedOwners -or
  $_.AccessControlType -ne 'Allow' -or
  $_.FileSystemRights -ne 'FullControl'
})
if (!$existingAcl.AreAccessRulesProtected -or $existingRules.Count -ne 2 -or $unexpectedRules.Count -ne 0) {
  Set-Acl -LiteralPath $signingRoot -AclObject $credentialAcl
}

$keyPath = Join-Path $signingRoot 'distribution-encrypted.key'
$passwordPath = Join-Path $signingRoot 'distribution-password.dpapi'
$requestPath = Join-Path $signingRoot 'ArceliraDistribution.certSigningRequest'
$p12Path = Join-Path $signingRoot 'ArceliraDistribution.p12'
$priorSigningEnvironment = $env:ARCELIRA_SIGNING_PASSWORD

try {
if ($Mode -eq 'request') {
  foreach ($target in @($keyPath, $requestPath)) {
    if (Test-Path -LiteralPath $target) { throw 'Existing signing material found; refusing to overwrite.' }
  }
  if (Test-Path -LiteralPath $passwordPath) {
    # Resume an interrupted request only when no key or CSR was produced.
    $securePassword = ConvertTo-SecureString ([System.IO.File]::ReadAllText($passwordPath))
    $signingPassword = (New-Object System.Net.NetworkCredential('', $securePassword)).Password
  } else {
    $randomBytes = New-Object byte[] 48
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($randomBytes) } finally { $generator.Dispose() }
    $signingPassword = [Convert]::ToBase64String($randomBytes)
    $securePassword = ConvertTo-SecureString $signingPassword -AsPlainText -Force
    # DPAPI encrypts the password for the current Windows user and computer.
    [System.IO.File]::WriteAllText($passwordPath, (ConvertFrom-SecureString $securePassword))
  }
  $env:ARCELIRA_SIGNING_PASSWORD = $signingPassword
  & $opensslPath genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -aes-256-cbc -pass env:ARCELIRA_SIGNING_PASSWORD -out $keyPath 2>$null
  if ($LASTEXITCODE -ne 0) { throw 'Encrypted RSA key generation failed.' }
  & $opensslPath req -new -sha256 -key $keyPath -passin env:ARCELIRA_SIGNING_PASSWORD -subj '/CN=Arcelira Distribution' -out $requestPath
  if ($LASTEXITCODE -ne 0) { throw 'Certificate request generation failed.' }
  & $opensslPath req -in $requestPath -noout -verify
  if ($LASTEXITCODE -ne 0) { throw 'Certificate request verification failed.' }
  Write-Output "Verified CSR: $requestPath"
} else {
  if (!$CertificatePath -or !(Test-Path -LiteralPath $CertificatePath -PathType Leaf)) {
    throw 'Provide the Apple-issued distribution certificate path.'
  }
  if (Test-Path -LiteralPath $p12Path) { throw 'Existing P12 found; refusing to overwrite.' }
  $securePassword = ConvertTo-SecureString ([System.IO.File]::ReadAllText($passwordPath))
  $signingPassword = (New-Object System.Net.NetworkCredential('', $securePassword)).Password
  $env:ARCELIRA_SIGNING_PASSWORD = $signingPassword
  $pemPath = Join-Path $signingRoot 'distribution-certificate.pem'
  if (Test-Path -LiteralPath $pemPath) { throw 'Existing certificate PEM found; refusing to overwrite.' }
  & $opensslPath x509 -inform DER -in $CertificatePath -out $pemPath
  if ($LASTEXITCODE -ne 0) { throw 'Certificate conversion failed.' }
  # Reject a certificate for a different team or private key.
  $certificateSubject = & $opensslPath x509 -in $pemPath -noout -subject
  if ($LASTEXITCODE -ne 0 -or $certificateSubject -notmatch 'X745NUQSB4') {
    throw 'Certificate does not belong to the approved Apple team.'
  }
  $certificateModulus = & $opensslPath x509 -in $pemPath -noout -modulus
  $keyModulus = & $opensslPath rsa -in $keyPath -passin env:ARCELIRA_SIGNING_PASSWORD -noout -modulus 2>$null
  if ($LASTEXITCODE -ne 0 -or $certificateModulus -ne $keyModulus) {
    throw 'Apple certificate does not match the generated private key.'
  }
  # Avoid PowerShell stdin line endings becoming part of an OpenSSL password.
  & $opensslPath pkcs12 -export -inkey $keyPath -in $pemPath -name 'Arcelira Apple Distribution' -passin env:ARCELIRA_SIGNING_PASSWORD -passout env:ARCELIRA_SIGNING_PASSWORD -out $p12Path
  if ($LASTEXITCODE -ne 0) { throw 'Encrypted P12 export failed.' }
  & $opensslPath pkcs12 -in $p12Path -passin env:ARCELIRA_SIGNING_PASSWORD -info -noout 2>$null
  if ($LASTEXITCODE -ne 0) { throw 'P12 verification failed.' }
  Write-Output "Verified encrypted P12: $p12Path"
}
} finally {
  $env:ARCELIRA_SIGNING_PASSWORD = $priorSigningEnvironment
  $signingPassword = $null
  $securePassword = $null
}
