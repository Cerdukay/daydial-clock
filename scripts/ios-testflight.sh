#!/usr/bin/env bash
set -euo pipefail

# Run only on an ephemeral macOS GitHub-hosted runner, never a personal Mac.
[[ "$(uname -s)" == Darwin && "${GITHUB_ACTIONS:-}" == true ]] || {
  echo 'This script requires a GitHub-hosted macOS Actions runner.' >&2
  exit 1
}
for name in IOS_DISTRIBUTION_P12_BASE64 IOS_DISTRIBUTION_P12_PASSWORD IOS_APPSTORE_PROFILE_BASE64 ASC_KEY_ID ASC_ISSUER_ID ASC_PRIVATE_KEY IOS_VERSION IOS_BUILD_NUMBER RUNNER_TEMP; do
  [[ -n "${!name:-}" ]] || { echo "::error::Missing $name"; exit 1; }
done
[[ "$IOS_VERSION" =~ ^[0-9]+\.[0-9]+(\.[0-9]+)?$ ]] || { echo '::error::Invalid iOS version'; exit 1; }
[[ "$IOS_BUILD_NUMBER" =~ ^[1-9][0-9]{0,8}$ ]] || { echo '::error::Build number must be a positive integer of at most nine digits'; exit 1; }
[[ "$ASC_KEY_ID" =~ ^[A-Z0-9]{10}$ ]] || { echo '::error::Invalid App Store Connect Key ID'; exit 1; }
[[ "$ASC_ISSUER_ID" =~ ^[a-fA-F0-9-]{36}$ ]] || { echo '::error::Invalid App Store Connect Issuer ID'; exit 1; }

# macOS's /usr/bin/openssl is LibreSSL and does not implement pkcs12 -iter.
# Use the already-installed Homebrew OpenSSL; do not download/install tools or
# weaken the compatibility package's iteration count to work around this.
openssl_bin="$(command -v openssl)"
if ! "$openssl_bin" pkcs12 -help 2>&1 | grep -- '-iter ' >/dev/null; then
  openssl_prefix="$(HOMEBREW_NO_AUTO_UPDATE=1 brew --prefix openssl@3)"
  openssl_bin="$openssl_prefix/bin/openssl"
fi
[[ -x "$openssl_bin" ]] || { echo '::error::Installed OpenSSL is unavailable'; exit 1; }
"$openssl_bin" version

signing_dir="$(mktemp -d "$RUNNER_TEMP/arcelira-signing.XXXXXX")"
keychain_path="$signing_dir/arcelira.keychain-db"
profile_path=''
key_path="$signing_dir/AuthKey_${ASC_KEY_ID}.p8"
cleanup() {
  security delete-keychain "$keychain_path" >/dev/null 2>&1 || true
  # Explicit files only. Never recursively remove a home/workspace directory.
  if [[ -n "$profile_path" ]]; then rm -f -- "$profile_path"; fi
  rm -f -- "$signing_dir/distribution.p12" "$signing_dir/apple-import.p12" "$signing_dir/import-encrypted.pem" "$signing_dir/profile.mobileprovision" \
    "$signing_dir/profile.plist" "$signing_dir/signing.json" "$key_path" "$signing_dir/ExportOptions.plist"
  rmdir "$signing_dir" 2>/dev/null || true
}
trap cleanup EXIT
umask 077
printf '%s' "$IOS_DISTRIBUTION_P12_BASE64" | base64 --decode > "$signing_dir/distribution.p12"
printf '%s' "$IOS_APPSTORE_PROFILE_BASE64" | base64 --decode > "$signing_dir/profile.mobileprovision"
printf '%s\n' "$ASC_PRIVATE_KEY" > "$key_path"
security cms -D -i "$signing_dir/profile.mobileprovision" > "$signing_dir/profile.plist"

# Validate profile before importing secrets. Derive export options from this
# exact profile; never silently switch to an unrelated developer's team/profile.
python3 - "$signing_dir" <<'PY'
import datetime, json, pathlib, plistlib, re, sys
folder = pathlib.Path(sys.argv[1])
with (folder / 'profile.plist').open('rb') as source:
    profile = plistlib.load(source)
entitlements = profile['Entitlements']
team = profile['TeamIdentifier'][0]
prefix = profile['ApplicationIdentifierPrefix'][0]
bundle = 'com.daydial.app'
if entitlements.get('application-identifier') != f'{prefix}.{bundle}':
    raise SystemExit('Distribution profile does not match com.daydial.app. Confirm the Apple Bundle ID first.')
if entitlements.get('get-task-allow') or profile.get('ProvisionedDevices') or profile.get('ProvisionsAllDevices'):
    raise SystemExit('Use an App Store Connect distribution profile, not development/Ad Hoc/enterprise.')
if profile['ExpirationDate'] <= datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None):
    raise SystemExit('Distribution profile has expired.')
uuid = profile['UUID']
if not re.fullmatch(r'[A-Fa-f0-9-]{36}', uuid) or not re.fullmatch(r'[A-Z0-9]{10}', team):
    raise SystemExit('Invalid profile UUID or Team ID.')
options = {
    'method': 'app-store-connect', 'destination': 'export', 'teamID': team,
    'signingStyle': 'manual', 'signingCertificate': 'Apple Distribution',
    'provisioningProfiles': {bundle: uuid}, 'manageAppVersionAndBuildNumber': False,
    'uploadSymbols': True,
}
with (folder / 'ExportOptions.plist').open('wb') as destination:
    plistlib.dump(options, destination)
(folder / 'signing.json').write_text(json.dumps({'team': team, 'uuid': uuid}))
PY
team_id="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["team"])' "$signing_dir/signing.json")"
profile_uuid="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["uuid"])' "$signing_dir/signing.json")"
# The workflow requires Xcode 26; Xcode 16+ uses the UserData location.
profile_dir="$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles"
mkdir -p "$profile_dir"
profile_target="$profile_dir/$profile_uuid.mobileprovision"
[[ ! -e "$profile_target" ]] || { echo '::error::Unexpected existing provisioning profile'; exit 1; }
profile_path="$profile_target"
cp "$signing_dir/profile.mobileprovision" "$profile_path"

keychain_password="$("$openssl_bin" rand -hex 24)"
security create-keychain -p "$keychain_password" "$keychain_path"
security set-keychain-settings -lut 21600 "$keychain_path"
security unlock-keychain -p "$keychain_password" "$keychain_path"

# OpenSSL 3 exports PBES2/AES by default, which Apple's PKCS#12 importer can
# misleadingly report as an incorrect password. Verify the original MAC and
# password first; never bypass integrity verification or replace stored secrets.
if ! "$openssl_bin" pkcs12 -in "$signing_dir/distribution.p12" \
  -passin env:IOS_DISTRIBUTION_P12_PASSWORD -noout; then
  echo '::error::Distribution P12 password/integrity verification failed before Apple import.'
  exit 1
fi
# Repackage only on this ephemeral runner. The original AES-encrypted backup
# and GitHub secret remain unchanged. The intermediate PEM is AES-256 encrypted,
# never an unencrypted private-key file/log. Export needs a seekable PEM because
# OpenSSL reads its key and certificates separately. The compatibility P12 uses
# 3DES, a high iteration count, owner-only permissions, and trap cleanup.
"$openssl_bin" pkcs12 -in "$signing_dir/distribution.p12" \
  -passin env:IOS_DISTRIBUTION_P12_PASSWORD -passout env:IOS_DISTRIBUTION_P12_PASSWORD \
  -aes256 -out "$signing_dir/import-encrypted.pem"
"$openssl_bin" pkcs12 -export -in "$signing_dir/import-encrypted.pem" \
  -passin env:IOS_DISTRIBUTION_P12_PASSWORD -name 'Arcelira Apple Distribution' \
  -keypbe PBE-SHA1-3DES -certpbe PBE-SHA1-3DES -macalg sha1 -iter 100000 \
  -passout env:IOS_DISTRIBUTION_P12_PASSWORD -out "$signing_dir/apple-import.p12"
security import "$signing_dir/apple-import.p12" -P "$IOS_DISTRIBUTION_P12_PASSWORD" \
  -A -t cert -f pkcs12 -k "$keychain_path" >/dev/null
rm -f -- "$signing_dir/apple-import.p12" "$signing_dir/import-encrypted.pem"
security set-key-partition-list -S apple-tool:,apple:,codesign: -k "$keychain_password" "$keychain_path" >/dev/null
security list-keychains -d user -s "$keychain_path" login.keychain-db

mkdir -p build/ios/export
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath build/ios/Arcelira.xcarchive \
  -derivedDataPath build/ios/DerivedData \
  CODE_SIGN_STYLE=Manual CODE_SIGN_IDENTITY='Apple Distribution' \
  DEVELOPMENT_TEAM="$team_id" PROVISIONING_PROFILE_SPECIFIER="$profile_uuid" \
  MARKETING_VERSION="$IOS_VERSION" CURRENT_PROJECT_VERSION="$IOS_BUILD_NUMBER" archive
xcodebuild -exportArchive -archivePath build/ios/Arcelira.xcarchive \
  -exportPath build/ios/export -exportOptionsPlist "$signing_dir/ExportOptions.plist"
ipa_path="$(find build/ios/export -maxdepth 1 -name '*.ipa' -type f -print -quit)"
[[ -n "$ipa_path" ]] || { echo '::error::Xcode did not produce an IPA'; exit 1; }
# altool finds private keys via this directory; keys are not committed/artifacted.
API_PRIVATE_KEYS_DIR="$signing_dir" xcrun altool --upload-app --type ios --file "$ipa_path" \
  --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID"
echo 'Upload accepted. Wait for App Store Connect processing, then select the TestFlight build.'
