import Capacitor

class ArceliraBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(ArceliraAlarmPlugin())
    }
}
