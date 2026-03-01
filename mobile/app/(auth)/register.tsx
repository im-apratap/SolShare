import React, { useState } from "react";
import {
  View,
  StyleSheet,
  Text,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { router, Link } from "expo-router";
import { Container } from "../../src/components/Container";
import { Input } from "../../src/components/Input";
import { Button } from "../../src/components/Button";
import { colors } from "../../src/theme/colors";
import { apiClient, setTokens } from "../../src/api/client";
import { connectWallet } from "../../src/utils/solana";
import {
  registerForPushNotificationsAsync,
  sendPushTokenToBackend,
} from "../../src/utils/notifications";

export default function RegisterScreen() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pubKey, setPubKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleRegister = async () => {
    if (!name || !email || !username || !password || !pubKey) {
      setError("Please fill in all fields");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await apiClient.post("/users/register", {
        name,
        email,
        username,
        password,
        pubKey,
      });

      // The register endpoint returns accessToken/refreshToken
      const { accessToken, refreshToken } = response.data.data;
      await setTokens(accessToken, refreshToken);

      // Register push token
      const pushToken = await registerForPushNotificationsAsync();
      if (pushToken) {
        await sendPushTokenToBackend(pushToken);
      }

      router.replace("/(tabs)/home");
    } catch (err: any) {
      setError(
        err.response?.data?.message || err.message || "Failed to register",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleConnectWallet = async () => {
    try {
      const key = await connectWallet();
      setPubKey(key);
    } catch (err: any) {
      if (err?.message !== "User canceled request") {
        setError(err.message || "Failed to connect wallet.");
      }
    }
  };

  return (
    <Container>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>Join SolShare today</Text>
          </View>

          <View style={styles.form}>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <Input
              label="Full Name"
              placeholder="Enter Your Name"
              value={name}
              onChangeText={setName}
            />

            <Input
              label="Email"
              placeholder="Enter Your Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <Input
              label="Username"
              placeholder="Enter a Unique Username"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
            />

            <Input
              label="Password"
              placeholder="Create a strong password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            <View style={styles.walletSection}>
              <Text style={styles.walletLabel}>Solana Public Key</Text>
              {pubKey ? (
                <View style={styles.connectedWallet}>
                  <Text
                    style={styles.pubKeyText}
                    numberOfLines={1}
                    ellipsizeMode="middle"
                  >
                    {pubKey}
                  </Text>
                  <Button
                    title="Change"
                    onPress={handleConnectWallet}
                    variant="outline"
                  />
                </View>
              ) : (
                <Button
                  title="Connect Phantom/Solflare"
                  onPress={handleConnectWallet}
                  variant="outline"
                  style={styles.connectWalletBtn}
                />
              )}
            </View>

            <Button
              title="Create Account"
              onPress={handleRegister}
              loading={loading}
              style={styles.registerButton}
            />

            <View style={styles.footer}>
              <Text style={styles.footerText}>Already have an account? </Text>
              <Link href="/(auth)/login" asChild>
                <Text style={styles.linkText}>Sign In</Text>
              </Link>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Container>
  );
}

const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 60,
  },
  header: {
    alignItems: "flex-start",
    marginBottom: 32,
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    color: colors.primary,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textMuted,
    marginTop: 8,
  },
  form: {
    width: "100%",
  },
  registerButton: {
    marginTop: 24,
  },
  errorText: {
    color: colors.error,
    textAlign: "center",
    marginBottom: 16,
    fontSize: 14,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 32,
    marginBottom: 40,
  },
  footerText: {
    color: colors.textMuted,
    fontSize: 14,
  },
  linkText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "700",
  },
  walletSection: {
    marginBottom: 16,
  },
  walletLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 8,
    marginLeft: 4,
  },
  connectedWallet: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceLight,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pubKeyText: {
    flex: 1,
    color: colors.primary,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    marginRight: 12,
  },
  connectWalletBtn: {
    marginTop: 4,
  },
});
