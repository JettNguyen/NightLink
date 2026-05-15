import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        // Set the window background as early as possible so iOS 26 Liquid Glass
        // cannot composite its tint over the app before the WKWebView loads.
        let appBg = UIColor(red: 5.0/255.0, green: 7.0/255.0, blue: 15.0/255.0, alpha: 1.0)
        window?.backgroundColor = appBg
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        guard let url = URLContexts.first?.url else { return }
        _ = ApplicationDelegateProxy.shared.application(UIApplication.shared, open: url, options: [:])
    }

}