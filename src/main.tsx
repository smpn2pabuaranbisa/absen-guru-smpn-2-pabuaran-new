import { registerSW } from 'virtual:pwa-register';

// Register Service Worker for PWA or clean it up in development
if ('serviceWorker' in navigator) {
  if (import.meta.env.DEV) {
    // Unregister active service workers in development mode to prevent the stale service worker from serving cached index.html without Vite preamble
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      let unregistered = false;
      for (const registration of registrations) {
        registration.unregister().then((success) => {
          if (success) {
            console.log('Successfully unregistered stale service worker in development mode.');
            unregistered = true;
          }
        });
      }
      if (unregistered) {
        setTimeout(() => {
          window.location.reload();
        }, 100);
      }
    });
  } else {
    const updateSW = registerSW({
      onNeedRefresh() {
        if (confirm('Versi baru tersedia. Muat ulang untuk memperbarui?')) {
          updateSW(true);
        }
      },
      onOfflineReady() {
        console.log('Aplikasi siap digunakan secara offline');
      },
    });
  }
}

// Dynamically import bootstrap to avoid JSX/React imports failing on load-time preamble check
import('./bootstrap').catch((err) => {
  console.error('Failed to load bootstrap:', err);
});

