import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
const getBaseUrl = () => {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  if (__DEV__) {
    if (Platform.OS === "android") {
      return "http://10.0.2.2:8000/api";
    }
    return "http://localhost:8000/api";
  }
  return "http://localhost:8000/api";
};
export const apiClient = axios.create({
  baseURL: getBaseUrl(),
  timeout: 10000,
});
apiClient.interceptors.request.use(
  async (config) => {
    try {
      if (Platform.OS === "web") return config;
      const token = await AsyncStorage.getItem("accessToken");
      if (token) {
        if (config.headers) {
          config.headers["Authorization"] = `Bearer ${token}`;
        }
      }
    } catch (e) {
      console.error("Failed to inject token", e);
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: any) => void;
}> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    if (originalRequest.url?.includes("/users/refresh-token")) {
      await clearTokens();
      return Promise.reject(error);
    }
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            if (originalRequest.headers) {
              originalRequest.headers["Authorization"] = `Bearer ${token}`;
            }
            return apiClient(originalRequest);
          })
          .catch((err) => {
            return Promise.reject(err);
          });
      }
      originalRequest._retry = true;
      isRefreshing = true;
      try {
        const refreshToken = await AsyncStorage.getItem("refreshToken");
        if (!refreshToken) {
          // Instead of throwing a raw error, we clear tokens and reject
          // This allows the app to handle things more gracefully (e.g. redirect to login)
          await clearTokens();
          return Promise.reject(
            new Error("Session expired. Please log in again."),
          );
        }
        const res = await axios.post(`${getBaseUrl()}/users/refresh-token`, {
          refreshToken,
        });
        const { accessToken, refreshToken: newRefreshToken } = res.data.data;
        await setTokens(accessToken, newRefreshToken);
        if (originalRequest.headers) {
          originalRequest.headers["Authorization"] = `Bearer ${accessToken}`;
        }
        processQueue(null, accessToken);
        return apiClient(originalRequest);
      } catch (refreshError: any) {
        processQueue(refreshError, null);
        await clearTokens();
        // Return a more user-friendly error if it's not already one
        const message =
          refreshError.response?.data?.message || "Session expired";
        return Promise.reject(new Error(message));
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  },
);
export const clearTokens = async () => {
  if (Platform.OS === "web") return;
  try {
    await Promise.all([
      AsyncStorage.removeItem("accessToken"),
      AsyncStorage.removeItem("refreshToken"),
    ]);
  } catch (e) {
    console.error("Failed to clear tokens", e);
  }
};
export const setTokens = async (accessToken: string, refreshToken: string) => {
  if (Platform.OS === "web") return;
  try {
    await Promise.all([
      AsyncStorage.setItem("accessToken", accessToken),
      AsyncStorage.setItem("refreshToken", refreshToken),
    ]);
  } catch (e) {
    console.error("Failed to set tokens", e);
  }
};
