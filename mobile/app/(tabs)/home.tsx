import React, { useState } from "react";
import {
  View,
  StyleSheet,
  Text,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { FontAwesome5 } from "@expo/vector-icons";
import { Container } from "../../src/components/Container";
import { Card } from "../../src/components/Card";
import { Button } from "../../src/components/Button";
import { colors } from "../../src/theme/colors";
import { apiClient } from "../../src/api/client";
import { router, useFocusEffect } from "expo-router";
import { useSolPrice } from "../../src/hooks/useSolPrice";
export default function HomeScreen() {
  const [groups, setGroups] = useState([]);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const { solPrice, solPriceINR, loading: priceLoading } = useSolPrice();
  const fetchData = async () => {
    try {
      setError("");
      const [groupsRes, userRes] = await Promise.all([
        apiClient.get("/groups"),
        apiClient.get("/users/me"),
      ]);
      setGroups(groupsRes.data.data || []);
      setUser(userRes.data.data);
    } catch (err: any) {
      setError(
        err.response?.data?.message || err.message || "Failed to load data",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };
  useFocusEffect(
    React.useCallback(() => {
      fetchData();
    }, []),
  );
  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };
  const renderGroupItem = ({ item }: { item: any }) => (
    <Card style={styles.groupCard}>
      <View style={styles.groupCardImagePlaceholder}>
        <FontAwesome5 name="layer-group" size={32} color={colors.primary} />
      </View>
      <View style={styles.groupInfoRow}>
        <View style={styles.groupInfo}>
          <Text style={styles.groupName}>{item.name}</Text>
          <Text style={styles.memberCount}>
            {item.members?.length || 0} members
          </Text>
        </View>
        <Button
          title=""
          variant="primary"
          style={styles.floatingArrowBtn}
          onPress={() => router.push(`/group/${item._id}` as any)}
        />
        <View pointerEvents="none" style={styles.iconOverlay}>
          <FontAwesome5 name="chevron-right" size={16} color="#FFFFFF" />
        </View>
      </View>
    </Card>
  );
  if (loading && !refreshing) {
    return (
      <Container style={styles.centerElement}>
        <ActivityIndicator size="large" color={colors.primary} />
      </Container>
    );
  }
  return (
    <Container>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.greetingTitle}>
            Hello, {user?.name?.split(" ")[0] || "User"}
          </Text>
          <Text style={styles.greetingSubtitle}>Welcome to SolShare</Text>
        </View>
        {}
        <View style={styles.priceBanner}>
          <View style={styles.priceBannerLeft}>
            <View style={styles.solIconContainer}>
              <FontAwesome5 name="coins" size={16} color={colors.secondary} />
            </View>
            <View>
              <Text style={styles.priceBannerLabel}>EXCHANGE RATES</Text>
              {priceLoading || solPrice === null || solPriceINR === null ? (
                <ActivityIndicator size="small" color={colors.secondary} />
              ) : (
                <Text style={styles.priceBannerValue}>
                  1 SOL = ${solPrice.toFixed(2)} = ₹{solPriceINR.toFixed(2)}
                </Text>
              )}
            </View>
          </View>
          <View style={styles.priceBannerBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.priceBannerBadgeText}>LIVE</Text>
          </View>
        </View>
        {}
        <View style={styles.filtersContainer}>
          <View style={[styles.filterPill, styles.filterPillActive]}>
            <Text style={styles.filterPillTextActive}>Your Groups</Text>
          </View>
          <View style={styles.filterPill}>
            <Text style={styles.filterPillText}>Recent</Text>
          </View>
          <View style={styles.filterPill}>
            <Text style={styles.filterPillText}>Settled</Text>
          </View>
        </View>
        {error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
            <Button title="Retry" onPress={fetchData} variant="secondary" />
          </View>
        ) : null}
        <FlatList
          data={groups}
          keyExtractor={(item: any) => item._id}
          renderItem={renderGroupItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <FontAwesome5
                name="folder-open"
                size={48}
                color={colors.border}
              />
              <Text style={styles.emptyText}>
                You don&apos;t have any groups yet
              </Text>
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
        />
        {}
        <View style={styles.floatingActionWrapper}>
          <Button
            title="+ Create Group"
            onPress={() => router.push("/group/create" as any)}
            style={styles.floatingAddBtn}
          />
        </View>
      </View>
    </Container>
  );
}
const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingTop: 16,
    paddingHorizontal: 16,
  },
  centerElement: {
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    marginTop: 24,
    marginBottom: 24,
  },
  greetingTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: -0.5,
  },
  greetingSubtitle: {
    fontSize: 16,
    color: colors.textMuted,
    marginTop: 6,
  },
  priceBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 18,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  priceBannerLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  solIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(153, 69, 255, 0.1)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  priceBannerLabel: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: "600",
  },
  priceBannerValue: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.primary,
    marginTop: 2,
  },
  priceBannerBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(20, 241, 149, 0.1)",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
    marginRight: 5,
  },
  priceBannerBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.success,
    letterSpacing: 1,
  },
  filtersContainer: {
    flexDirection: "row",
    marginBottom: 24,
  },
  filterPill: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 999,
    backgroundColor: colors.surface,
    marginRight: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterPillText: {
    color: colors.textMuted,
    fontWeight: "600",
    fontSize: 14,
  },
  filterPillTextActive: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 14,
  },
  listContent: {
    paddingBottom: 40,
  },
  groupCard: {
    padding: 16,
  },
  groupCardImagePlaceholder: {
    backgroundColor: colors.surfaceLight,
    height: 140,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  groupInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  groupInfo: {
    flex: 1,
  },
  groupName: {
    color: colors.primary,
    fontSize: 20,
    fontWeight: "700",
  },
  memberCount: {
    color: colors.textMuted,
    fontSize: 14,
    marginTop: 6,
  },
  floatingArrowBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    paddingHorizontal: 0,
    paddingVertical: 0,
    marginVertical: 0,
    minHeight: 0,
  },
  iconOverlay: {
    position: "absolute",
    right: 16,
  },
  floatingActionWrapper: {
    paddingVertical: 16,
    paddingTop: 8,
  },
  floatingAddBtn: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 64,
  },
  emptyText: {
    color: colors.textMuted,
    marginTop: 20,
    fontSize: 16,
    fontWeight: "500",
  },
  errorContainer: {
    padding: 16,
    backgroundColor: "rgba(255, 77, 77, 0.1)",
    borderRadius: 16,
    marginBottom: 24,
    alignItems: "center",
  },
  errorText: {
    color: colors.error,
    marginBottom: 12,
    textAlign: "center",
  },
});
