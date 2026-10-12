require 'xcodeproj'
# Test target exists only in the disposable runner checkout.
project = Xcodeproj::Project.open('ios/App/App.xcodeproj')
app = project.targets.find { |target| target.name == 'App' }
raise 'Expected App target' unless app
tests = project.new_target(:ui_test_bundle, 'ArceliraScreenshots', :ios, '15.0')
tests.add_dependency(app)
group = project.main_group.new_group('ScreenshotTests', '../../scripts/ios-screenshots')
tests.source_build_phase.add_file_reference(group.new_file('Screenshots.swift'))
tests.build_configurations.each do |config|
  config.build_settings.merge!({
    'TEST_TARGET_NAME' => 'App',
    'PRODUCT_BUNDLE_IDENTIFIER' => 'com.daydial.app.screenshot-tests',
    'GENERATE_INFOPLIST_FILE' => 'YES',
    'SWIFT_VERSION' => '5.0',
    'TARGETED_DEVICE_FAMILY' => '1,2',
    'CODE_SIGNING_ALLOWED' => 'NO'
  })
end
project.root_object.attributes['TargetAttributes'][tests.uuid] = { 'TestTargetID' => app.uuid }
project.save
scheme = Xcodeproj::XCScheme.new
scheme.add_build_target(app)
scheme.add_build_target(tests, false)
scheme.add_test_target(tests)
scheme.set_launch_target(app)
scheme.test_action.build_configuration = 'Release'
scheme.save_as(project.path, 'ArceliraScreenshots', true)
