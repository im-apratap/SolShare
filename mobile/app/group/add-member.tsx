import React, { useState } from "react";
import {
  View,
  StyleSheet,
  Text,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Container } from "../../src/components/Container";
import { Input } from "../../src/components/Input";
import { Button } from "../../src/components/Button";
import { colors } from "../../src/theme/colors";
import { apiClient } from "../../src/api/client";
import { FontAwesome5 } from "@expo/vector-icons";

export default function AddMemberScreen() {
  const { groupId } = useLocalSearchParams();
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [friends, setFriends] = useState<any[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(true);

  React.useEffect(() => {
    fetchFriends();
  }, []);

  const fetchFriends = async () => {
    try {
      const { data } = await apiClient.get("/friends");
      setFriends(data);
    } catch (err) {
      console.error("Failed to load friends", err);
    } finally {
      setLoadingFriends(false);
    }
  };

  const handleAddMember = async (targetUsername?: string) => {
    const userToAdd = targetUsername || username.trim();

    if (!userToAdd) {
      setError("Please enter a username or select a friend");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await apiClient.post(`/groups/${groupId}/members`, {
        username: userToAdd,
      });
      // Navigate back to the group details screen, resolving the promise
      router.back();
    } catch (err: any) {
      setError(
        err.response?.data?.message || err.message || "Failed to add user",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Add Member</Text>
          <Text style={styles.subtitle}>
            Invite someone to the group using their SolShare username.
          </Text>
        </View>

        <View style={styles.form}>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Input
            label="Username"
            placeholder="e.g. solanawhale"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoFocus
          />

          <Button
            title="Add to Group"
            onPress={() => handleAddMember()}
            loading={loading && !username.includes("friend")} // simplify loading state
            style={styles.actionButton}
          />

          <Button
            title="Cancel"
            onPress={() => router.back()}
            variant="outline"
            disabled={loading}
          />
        </View>

        <View style={styles.friendsSection}>
          <Text style={styles.sectionTitle}>Or select from Friends</Text>
          {loadingFriends ? (
            <Text style={styles.loadingText}>Loading friends...</Text>
          ) : friends.length === 0 ? (
            <Text style={styles.emptyText}>
              You have not added any friends yet.
            </Text>
          ) : (
            friends.map((friend) => (
              <TouchableOpacity
                key={friend._id}
                style={styles.friendCard}
                onPress={() => handleAddMember(friend.username)}
                disabled={loading}
              >
                <View style={styles.friendAvatar}>
                  <Text style={styles.friendAvatarText}>
                    {friend.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.friendInfo}>
                  <Text style={styles.friendName}>{friend.name}</Text>
                  <Text style={styles.friendUsername}>@{friend.username}</Text>
                </View>
                <View style={styles.addIconBtn}>
                  <FontAwesome5 name="plus" size={14} color="#fff" />
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>
    </Container>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 24,
    paddingTop: 16,
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
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
  actionButton: {
    marginTop: 24,
    marginBottom: 12,
  },
  errorText: {
    color: colors.error,
    textAlign: "center",
    marginBottom: 16,
    fontSize: 14,
  },
  friendsSection: {
    marginTop: 40,
    width: "100%",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 16,
  },
  loadingText: {
    color: colors.textMuted,
    textAlign: "center",
  },
  emptyText: {
    color: colors.textMuted,
    textAlign: "center",
    marginTop: 10,
  },
  friendCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  friendAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${colors.primary}20`,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  friendAvatarText: {
    color: colors.primary,
    fontWeight: "bold",
    fontSize: 16,
  },
  friendInfo: {
    flex: 1,
  },
  friendName: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
  },
  friendUsername: {
    fontSize: 13,
    color: colors.textMuted,
  },
  addIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
});
