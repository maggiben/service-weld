import { WeldApiClient, ApiClientError } from "@weld/api-client";
import { useSessionStore } from "@/store/sessionStore";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3000/api/v1";

/** Re-export under the local name used by screens. */
export { ApiClientError as ApiError };

export const api = new WeldApiClient({
  baseUrl: API_BASE,
  tokens: {
    getAccessToken: () => useSessionStore.getState().accessToken,
    getRefreshToken: () => useSessionStore.getState().refreshToken,
    setTokens: (access: string, refresh: string) =>
      useSessionStore.getState().setSession(access, refresh),
    clearTokens: () => useSessionStore.getState().clearSession(),
  },
});
