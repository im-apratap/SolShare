import { Stack, router } from "expo-router";
import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { View, ActivityIndicator, Platform } from "react-native";
import { colors } from "../src/theme/colors";
import {
  registerForPushNotificationsAsync,
  sendPushTokenToBackend,
} from "../src/utils/notifications";
import { usePushNotifications } from "../src/hooks/usePushNotifications";
import { SolPriceProvider } from "../src/hooks/useSolPrice";

export default function RootLayout() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  usePushNotifications();

  useEffect(() => {
    checkToken();
  }, []);

  const checkToken = async () => {
    try {
      if (Platform.OS === "web") {
        setIsAuthenticated(false);
        return;
      }
      const token = await AsyncStorage.getItem("accessToken");
      if (token) {
        setIsAuthenticated(true);
        // User already logged in, update push token in background
        if (Platform.OS === "android" || Platform.OS === "ios") {
          registerForPushNotificationsAsync().then((pushToken) => {
            if (pushToken) sendPushTokenToBackend(pushToken);
          });
        }
      } else {
        setIsAuthenticated(false);
      }
    } catch {
      setIsAuthenticated(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated === true) {
      router.replace("/(tabs)/home");
    } else if (isAuthenticated === false) {
      router.replace("/(auth)/login");
    }
  }, [isAuthenticated]);

  if (isAuthenticated === null) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SolPriceProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="group/[id]" />
        <Stack.Screen name="expense/create" />
        <Stack.Screen name="settlement/create" />
      </Stack>
    </SolPriceProvider>
  );
}
