#!/usr/bin/env bash
set -euo pipefail

# Pin the SDK family, not macOS's default Xcode (which may be an older SDK).
# No beta/preview SDK is selected and nothing is downloaded or purchased.
xcode_app="$(python3 - <<'PY'
import pathlib, re
pattern = re.compile(r'^Xcode_(26(?:\.\d+)*)\.app$')
versions = []
for path in pathlib.Path('/Applications').glob('Xcode_26*.app'):
    match = pattern.fullmatch(path.name)
    if match:
        versions.append((tuple(map(int, match[1].split('.'))), str(path)))
print(max(versions)[1] if versions else '')
PY
)"
if [[ -z "$xcode_app" ]]; then
  echo '::error::No stable Xcode 26 is installed on this runner. Update the runner/SDK selection.'
  exit 1
fi
sudo xcode-select --switch "$xcode_app/Contents/Developer"
xcodebuild -version
sdk_version="$(xcrun --sdk iphoneos --show-sdk-version)"
[[ "${sdk_version%%.*}" -ge 26 ]] || { echo '::error::iOS 26+ SDK is required.'; exit 1; }
