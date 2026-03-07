import React, { useState, useCallback } from "react";
import {
  View,
  StyleSheet,
  Text,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { Container } from "../../../src/components/Container";
import { Input } from "../../../src/components/Input";
import { Button } from "../../../src/components/Button";
import { Picker } from "@react-native-picker/picker";
import { colors } from "../../../src/theme/colors";
import { apiClient } from "../../../src/api/client";
import { useCurrencyPreference } from "../../../src/hooks/useCurrencyPreference";
export default function EditExpenseScreen() {
  const { id } = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [splitType, setSplitType] = useState("equal");
  const [members, setMembers] = useState<any[]>([]);
  const [shares, setShares] = useState<{ [key: string]: string }>({});
  const { getCurrencySymbol, preferredCurrency } = useCurrencyPreference();

  const fetchExpenseDetails = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get(`/expenses/${id}`);
      const expense = res.data.data;
      setDescription(expense.description);
      setAmount(expense.amount.toString());
      setSplitType(expense.splitType);
      const groupRes = await apiClient.get(`/groups/${expense.groupId}`);
      setMembers(groupRes.data.data.members || []);
      if (expense.splitType !== "equal" && expense.shares) {
        const sharesMap: { [key: string]: string } = {};
        expense.shares.forEach((s: any) => {
          sharesMap[s.user._id || s.user] = s.amount.toString();
        });
        setShares(sharesMap);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to load expense");
    } finally {
      setLoading(false);
    }
  }, [id]);
  useFocusEffect(
    useCallback(() => {
      if (id) fetchExpenseDetails();
    }, [id, fetchExpenseDetails]),
  );
  const handleShareChange = (userId: string, value: string) => {
    setShares((prev) => ({ ...prev, [userId]: value }));
  };
  const handleUpdateExpense = async () => {
    if (!description || !amount || isNaN(Number(amount))) {
      setError("Please provide a valid description and amount");
      return;
    }
    let sharesPayload: any[] = [];
    if (splitType === "custom" || splitType === "percentage") {
      sharesPayload = Object.entries(shares)
        .filter(([_, val]) => val !== "" && !isNaN(Number(val)))
        .map(([user, val]) => ({ user, amount: Number(val) }));
      if (sharesPayload.length === 0) {
        setError(`Please enter the ${splitType} amounts below`);
        return;
      }
    }
    setSaving(true);
    setError("");
    try {
      await apiClient.put(`/expenses/${id}`, {
        description,
        amount: Number(amount),
        splitType,
        shares: sharesPayload.length > 0 ? sharesPayload : undefined,
      });
      router.back();
    } catch (err: any) {
      setError(
        err.response?.data?.message || err.message || "Failed to edit expense",
      );
    } finally {
      setSaving(false);
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
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Edit Expense</Text>
          <Text style={styles.subtitle}>Modify your transaction</Text>
        </View>
        <View style={styles.form}>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <Input
            label="Description"
            placeholder="Dinner, Taxi, Groceries..."
            value={description}
            onChangeText={setDescription}
          />
          <Input
            label={`Amount (in ${preferredCurrency})`}
            placeholder="0.00"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
          />
          <View style={styles.pickerContainer}>
            <Text style={styles.pickerLabel}>Split Option</Text>
            <View style={styles.pickerWrapper}>
              <Picker
                selectedValue={splitType}
                onValueChange={(itemValue) => setSplitType(itemValue)}
                style={styles.picker}
                dropdownIconColor={colors.primary}
              >
                <Picker.Item label="Split Equally" value="equal" />
                <Picker.Item label="Custom Split" value="custom" />
                <Picker.Item label="Percentage Split" value="percentage" />
              </Picker>
            </View>
          </View>
          {(splitType === "custom" || splitType === "percentage") &&
            members.length > 0 && (
              <View style={styles.sharesContainer}>
                <Text style={styles.sharesTitle}>
                  {splitType === "custom"
                    ? `Enter Custom Amounts (${getCurrencySymbol()})`
                    : "Enter Percentages (%)"}
                </Text>
                {members.map((member) => (
                  <View key={member._id} style={styles.shareRow}>
                    <Text style={styles.shareName}>
                      {member.name || member.username}
                    </Text>
                    <Input
                      placeholder="0"
                      value={shares[member._id] || ""}
                      onChangeText={(val) => handleShareChange(member._id, val)}
                      keyboardType="decimal-pad"
                      style={styles.shareInput}
                      containerStyle={styles.shareInputContainer}
                    />
                  </View>
                ))}
              </View>
            )}
          <Button
            title="Save Changes"
            onPress={handleUpdateExpense}
            loading={saving}
            style={styles.actionButton}
          />
          <Button
            title="Cancel"
            onPress={() => router.back()}
            variant="outline"
            disabled={saving}
          />
        </View>
      </ScrollView>
    </Container>
  );
}
const styles = StyleSheet.create({
  content: { padding: 24, paddingTop: 16 },
  centerElement: { alignItems: "center", justifyContent: "center" },
  header: { marginBottom: 24 },
  title: { fontSize: 28, fontWeight: "800", color: colors.primary },
  subtitle: { fontSize: 16, color: colors.textMuted, marginTop: 8 },
  form: { width: "100%" },
  errorText: {
    color: colors.error,
    textAlign: "center",
    marginBottom: 16,
    fontSize: 14,
  },
  pickerContainer: { marginBottom: 24 },
  pickerLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
    marginBottom: 8,
    marginLeft: 4,
  },
  pickerWrapper: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  picker: { height: 56, width: "100%", color: colors.text },
  sharesContainer: {
    backgroundColor: colors.surfaceLight,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 24,
  },
  sharesTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.primary,
    marginBottom: 16,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  shareRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  shareName: { fontSize: 14, color: colors.text, flex: 1, fontWeight: "600" },
  shareInputContainer: { width: 100, marginVertical: 0 },
  shareInput: { paddingVertical: 10, paddingHorizontal: 16, height: 44 },
  actionButton: { marginTop: 8, marginBottom: 12 },
});
