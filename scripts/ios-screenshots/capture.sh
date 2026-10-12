#!/usr/bin/env bash
set -euo pipefail
output_dir="$PWD/build/ios/screenshots"
mkdir -p "$output_dir"
git diff --exit-code 87c692989cf821ff2ff8f7684d0a6da771635173 HEAD -- src ios public capacitor-index.html capacitor.config.ts package.json package-lock.json vite.capacitor.config.ts
ruby -e 'require "xcodeproj"' || gem install xcodeproj --version 1.27.0 --no-document --user-install
export GEM_PATH="$(ruby -e 'puts Gem.user_dir'):${GEM_PATH:-}"
ruby scripts/ios-screenshots/prepare.rb
read -r runtime_id iphone_type ipad_type < <(node scripts/ios-screenshots/collect.mjs select)
active_simulator=""
trap 'if [[ -n "$active_simulator" ]]; then xcrun simctl shutdown "$active_simulator" || true; fi' EXIT
for family in iphone ipad; do
  if [[ "$family" == iphone ]]; then device_type="$iphone_type"; else device_type="$ipad_type"; fi
  active_simulator="$(xcrun simctl create "Arcelira store $family" "$device_type" "$runtime_id")"
  xcrun simctl boot "$active_simulator"
  xcrun simctl bootstatus "$active_simulator" -b
  xcrun simctl ui "$active_simulator" appearance dark
  xcrun simctl status_bar "$active_simulator" override --time '9:41' --dataNetwork wifi --wifiMode active --wifiBars 3 --batteryState charged --batteryLevel 100
  result_path="$output_dir/$family.xcresult"
  native_status=0
  xcodebuild -project ios/App/App.xcodeproj -scheme ArceliraScreenshots -configuration Release \
    -destination "platform=iOS Simulator,id=$active_simulator" -derivedDataPath build/ios/DerivedData \
    -resultBundlePath "$result_path" -parallel-testing-enabled NO \
    CODE_SIGNING_ALLOWED=NO test 2>&1 | tee "$output_dir/$family-test.log" || native_status=$?
  if [[ -d "$result_path" ]]; then
    xcrun xcresulttool export attachments --path "$result_path" --output-path "$output_dir/$family-attachments"
  fi
  xcrun simctl shutdown "$active_simulator"
  active_simulator=""
  [[ "$native_status" == 0 ]] || exit "$native_status"
done
node scripts/ios-screenshots/collect.mjs verify "$output_dir"
