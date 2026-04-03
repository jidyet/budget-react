import { useEffect, useState } from "react";

export default function useInstallPrompt() {
  const [installPromptEvent, setInstallPromptEvent] = useState(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [pwaInstalled, setPwaInstalled] = useState(
    typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(display-mode: standalone)").matches
  );
  const [offlineReady, setOfflineReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const onBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setInstallPromptEvent(event);
      setShowInstallPrompt(true);
    };

    const onInstalled = () => {
      setPwaInstalled(true);
      setInstallPromptEvent(null);
      setShowInstallPrompt(false);
    };

    const onControllerChange = () => setOfflineReady(true);

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    const serviceWorker = navigator.serviceWorker;
    if (serviceWorker && typeof serviceWorker.addEventListener === "function") {
      serviceWorker.addEventListener("controllerchange", onControllerChange);
    }
    if (serviceWorker?.controller) setOfflineReady(true);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      if (serviceWorker && typeof serviceWorker.removeEventListener === "function") {
        serviceWorker.removeEventListener("controllerchange", onControllerChange);
      }
    };
  }, []);

  const dismissInstallPrompt = () => setShowInstallPrompt(false);

  const handleInstallApp = async () => {
    if (!installPromptEvent) return false;
    try {
      await installPromptEvent.prompt();
      await installPromptEvent.userChoice;
      return true;
    } catch (error) {
      console.error("install prompt error", error);
      return false;
    } finally {
      setInstallPromptEvent(null);
      setShowInstallPrompt(false);
    }
  };

  return {
    installPromptEvent,
    showInstallPrompt,
    setShowInstallPrompt,
    dismissInstallPrompt,
    pwaInstalled,
    offlineReady,
    handleInstallApp,
  };
}
