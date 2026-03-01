import React, { useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  Text,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { Container } from "../../src/components/Container";
import { Card } from "../../src/components/Card";
import { Button } from "../../src/components/Button";
import { colors } from "../../src/theme/colors";
import { apiClient, clearTokens } from "../../src/api/client";
import { FontAwesome5 } from "@expo/vector-icons";
import { router } from "expo-router";
import { connectWallet } from "../../src/utils/solana";
import { useSolPrice } from "../../src/hooks/useSolPrice";

export default function ProfileScreen() {
  const [user, setUser] = useState<any>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [balanceRaw, setBalanceRaw] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingBalance, setCheckingBalance] = useState(false);
  const { solPrice } = useSolPrice();

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const res = await apiClient.get("/users/me");
      setUser(res.data.data);
    } catch (err: any) {
      console.error("Failed to fetch profile", err);
    } finally {
      setLoading(false);
    }
  };

  const checkBalance = async () => {
    try {
      setCheckingBalance(true);
      const balanceRes = await apiClient.get("/settlements/balance");
      const solBalance = balanceRes.data.data.balance;
      setBalanceRaw(solBalance);
      setBalance(`${solBalance.toFixed(4)} SOL`);
    } catch {
      setBalance("Failed to load");
      Alert.alert("Error", "Could not fetch balance from Solana network.");
    } finally {
      setCheckingBalance(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert("Logout", "Are you sure you want to sign out?", [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: "Logout",
        onPress: async () => {
          try {
            await apiClient.post("/users/logout");
          } catch {
            // Ignore failure on backend, still clear locally
          }
          await clearTokens();
          router.replace("/(auth)/login");
        },
        style: "destructive",
      },
    ]);
  };

  const handleConnectWallet = async () => {
    try {
      const pubKey = await connectWallet();
      await apiClient.put("/users/pubkey", { pubKey });
      setUser({ ...user, pubKey });
      Alert.alert("Success", "Wallet connected successfully!");
    } catch (err: any) {
      console.error(err);
      if (err?.message !== "User canceled request") {
        Alert.alert("Error", err.message || "Failed to connect wallet.");
      }
    }
  };

  if (loading) {
    return (
      <Container style={styles.centerElement}>
        <ActivityIndicator size="large" color={colors.primary} />
      </Container>
    );
  }

  return (
    <Container>
      <View style={styles.content}>
        <Card style={styles.profileCard}>
          <View style={styles.avatarContainer}>
            <FontAwesome5 name="user-alt" size={40} color={colors.primary} />
          </View>

          <Text style={styles.name}>{user?.name || "User"}</Text>
          <Text style={styles.username}>@{user?.username || "unknown"}</Text>
          <Text style={styles.email}>{user?.email}</Text>
        </Card>

        <Text style={styles.sectionTitle}>Wallet Details</Text>
        <Card style={styles.walletCard}>
          <FontAwesome5
            name="wallet"
            size={24}
            color={colors.secondary}
            style={styles.walletIcon}
          />
          <View style={styles.walletInfo}>
            <Text style={styles.walletLabel}>Solana Public Key</Text>
            {user?.pubKey ? (
              <Text
                style={styles.walletKey}
                numberOfLines={1}
                ellipsizeMode="middle"
              >
                {user.pubKey}
              </Text>
            ) : (
              <Button
                title="Connect Wallet"
                onPress={handleConnectWallet}
                variant="outline"
                style={{ marginTop: 8 }}
              />
            )}

            <View style={styles.balanceContainer}>
              {balance === null ? (
                <Button
                  title="Check SOL Balance"
                  onPress={checkBalance}
                  loading={checkingBalance}
                  variant="outline"
                  style={styles.checkBalanceBtn}
                />
              ) : (
                <>
                  <Text style={styles.walletLabel}>Current Balance</Text>
                  <Text style={styles.balanceAmount}>{balance}</Text>
                  {balanceRaw !== null && solPrice !== null && (
                    <Text style={styles.balanceUsd}>
                      ~ ${(balanceRaw * solPrice).toFixed(2)} USD
                    </Text>
                  )}
                </>
              )}
            </View>
          </View>
        </Card>

        <View style={{ flex: 1 }} />

        <Button
          title="Sign Out"
          onPress={handleLogout}
          style={styles.logoutBtn}
          textStyle={{ fontWeight: "700" }}
        />
      </View>
    </Container>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    padding: 16,
  },
  centerElement: {
    alignItems: "center",
    justifyContent: "center",
  },
  profileCard: {
    alignItems: "center",
    paddingVertical: 32,
    marginBottom: 24,
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  name: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.primary, // Dark black text
  },
  username: {
    fontSize: 16,
    color: colors.textMuted,
    fontWeight: "600",
    marginTop: 4,
  },
  email: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.primary,
    marginBottom: 12,
  },
  walletCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
  },
  walletIcon: {
    marginRight: 16,
  },
  walletInfo: {
    flex: 1,
  },
  walletLabel: {
    color: colors.textMuted,
    fontSize: 12,
    marginBottom: 4,
  },
  walletKey: {
    color: colors.primary,
    fontSize: 14,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  balanceContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  balanceAmount: {
    color: colors.secondary,
    fontSize: 20,
    fontWeight: "800",
  },
  balanceUsd: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: "600",
    marginTop: 4,
  },
  checkBalanceBtn: {
    marginTop: 4,
  },
  logoutBtn: {
    marginBottom: 16,
  },
});
