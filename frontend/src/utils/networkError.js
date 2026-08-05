import { Capacitor } from '@capacitor/core';

export function isNativeApp() {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function networkErrorMessage(err) {
  if (err?.response) return null;
  if (isNativeApp()) {
    const api = import.meta.env.VITE_API_URL || 'https://api.swarm.co.in/api';
    return 'Cannot reach the server. Check mobile internet (Wi-Fi or mobile data) and try again. '
      + `API: ${api}`;
  }
  return 'Cannot reach the server. On another PC, open the app at the host computer\'s LAN address '
    + '(e.g. http://192.168.29.22:3000), not localhost. Ensure both frontend and backend are running on the host.';
}
