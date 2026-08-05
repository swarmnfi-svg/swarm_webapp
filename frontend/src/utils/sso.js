import { authAPI } from '../services/api';
import { isNativeApp } from './networkError';

/** Deep link registered in AndroidManifest for OAuth return (must match emPOWER redirect_uri). */
export const NATIVE_SSO_CALLBACK = 'com.nanofarm.swarm://auth/callback';

let cachedSsoConfig = null;

export async function loadSsoConfig() {
  if (cachedSsoConfig) return cachedSsoConfig;
  const { data } = await authAPI.ssoConfig();
  cachedSsoConfig = data.data;
  return cachedSsoConfig;
}

/**
 * Redirect to emPOWER SaaS login/signup when saas mode is enabled.
 * Web: full-page navigation (unchanged).
 * Native: open system browser; OAuth returns via deep link → appUrlOpen.
 */
export async function redirectToSso(flow) {
  const config = await loadSsoConfig();
  if (!config?.saasEnabled) return false;

  const native = isNativeApp();
  const fetchUrl = flow === 'signup' ? authAPI.ssoSignupUrl : authAPI.ssoLoginUrl;
  const returnTo = native
    ? NATIVE_SSO_CALLBACK
    : `${window.location.origin}/dashboard`;
  const { data } = await fetchUrl(returnTo, native);

  if (native) {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url: data.data, presentationStyle: 'popover' });
    return true;
  }

  window.location.href = data.data;
  return true;
}
