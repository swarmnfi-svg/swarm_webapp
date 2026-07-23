import { authAPI } from '../services/api';

let cachedSsoConfig = null;

export async function loadSsoConfig() {
  if (cachedSsoConfig) return cachedSsoConfig;
  const { data } = await authAPI.ssoConfig();
  cachedSsoConfig = data.data;
  return cachedSsoConfig;
}

export async function redirectToSso(flow) {
  const config = await loadSsoConfig();
  if (!config?.saasEnabled) return false;
  const fetchUrl = flow === 'signup' ? authAPI.ssoSignupUrl : authAPI.ssoLoginUrl;
  const returnTo = `${window.location.origin}/dashboard`;
  const { data } = await fetchUrl(returnTo);
  window.location.href = data.data;
  return true;
}
