import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  Text,
  ScrollView,
  ActivityIndicator,
  Modal,
  TouchableOpacity,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Container } from "../../src/components/Container";
import { Input } from "../../src/components/Input";
import { Button } from "../../src/components/Button";
import { colors } from "../../src/theme/colors";
import { apiClient } from "../../src/api/client";
import { FontAwesome5 } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import { signTransactionOnDevice, openSolscanTx } from "../../src/utils/solana";
import { useSolPrice } from "../../src/hooks/useSolPrice";

export default function CreateSettlementScreen() {
  const { groupId } = useLocalSearchParams();
  const [toUserId, setToUserId] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [members, setMembers] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [settlements, setSettlements] = useState<any[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [successModal, setSuccessModal] = useState(false);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [settledAmount, setSettledAmount] = useState<string>("");
  const [settledSolAmount, setSettledSolAmount] = useState<string>("");
  const [settledRate, setSettledRate] = useState<string>("");
  const { solPrice } = useSolPrice();

  const fetchData = React.useCallback(async () => {
    try {
      // Fetch current User profile
      const userRes = await apiClient.get("/users/me");
      const loggedInUserId = userRes.data.data._id;
      setCurrentUserId(loggedInUserId);

      // Fetch group members
      const res = await apiClient.get(`/groups/${groupId}`);
      const otherMembers = res.data.data.members.filter(
        (m: any) => m._id !== loggedInUserId,
      );
      setMembers(otherMembers);

      // Fetch group balances to know who the user owes
      const balanceRes = await apiClient.get(`/expenses/balances/${groupId}`);
      setSettlements(balanceRes.data.data.settlements);

      if (otherMembers.length > 0) {
        setToUserId(otherMembers[0]._id);
      }
    } catch (err) {
      console.error(err);
      setError("Failed to fetch group data");
    }
  }, [groupId]);

  useEffect(() => {
    if (groupId) {
      fetchData();
    }
  }, [groupId, fetchData]);

  const handleCheckAmount = () => {
    if (toUserId && settlements.length > 0 && currentUserId) {
      const oweThem = settlements.find(
        (s) => s.to._id === toUserId && s.from._id === currentUserId,
      );
      const theyOwe = settlements.find(
        (s) => s.from._id === toUserId && s.to._id === currentUserId,
      );

      if (oweThem) {
        setAmount(oweThem.amount.toString());
        setError(""); // Clear error
      } else if (theyOwe) {
        setAmount("0");
        setError(
          `You don't owe them. They actually owe you $${theyOwe.amount.toFixed(2)}.`,
        );
      } else {
        setAmount("0");
        setError("You don't owe this user anything.");
      }
    } else {
      setAmount("0");
      setError("No balances found or you don't owe anyone.");
    }
  };

  const handleSettle = async () => {
    if (!toUserId || !amount || isNaN(Number(amount))) {
      setError("Please select a user and valid amount");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await apiClient.post("/settlements/create", {
        groupId,
        toUserId,
        amount: Number(amount),
      });

      const { serializedTransaction, settlements } = res.data.data;

      if (!serializedTransaction) {
        throw new Error("No transaction object received from server");
      }

      // Prompt user to sign the transaction via Phantom/Solflare
      const signedTransaction = await signTransactionOnDevice(
        serializedTransaction,
      );

      // Submit the signed transaction back
      const submitRes = await apiClient.post("/settlements/submit", {
        settlementIds: settlements.map((s: any) => s.settlementId),
        signedTransaction,
      });

      // Show success modal with Solscan link
      const signature = submitRes.data.data.txSignature;
      setTxSignature(signature);
      setSettledAmount(amount);
      if (solPrice) {
        const solAmt = Number(amount) / solPrice;
        setSettledSolAmount(solAmt.toFixed(6));
        setSettledRate(solPrice.toFixed(2));
      }
      setSuccessModal(true);
    } catch (err: any) {
      setError(
        err.response?.data?.message || err.message || "Failed to settle",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleViewOnSolscan = () => {
    if (txSignature) {
      openSolscanTx(txSignature);
    }
  };

  const handleCloseSuccess = () => {
    setSuccessModal(false);
    router.back();
  };

  return (
    <Container>
      {/* Success Modal */}
      <Modal
        visible={successModal}
        transparent
        animationType="fade"
        onRequestClose={handleCloseSuccess}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.successIconContainer}>
              <FontAwesome5
                name="check-circle"
                size={64}
                color={colors.success}
              />
            </View>
            <Text style={styles.successTitle}>Payment Sent!</Text>
            <Text style={styles.successSubtitle}>
              Successfully settled ${settledAmount} on Solana
            </Text>

            {settledSolAmount !== "" && (
              <View style={styles.solAmountBadge}>
                <FontAwesome5 name="coins" size={14} color={colors.secondary} />
                <Text style={styles.solAmountText}>{settledSolAmount} SOL</Text>
                {settledRate !== "" && (
                  <Text style={styles.solRateText}>at ${settledRate}/SOL</Text>
                )}
              </View>
            )}

            {txSignature && (
              <View style={styles.txInfoContainer}>
                <Text style={styles.txLabel}>Transaction Signature</Text>
                <Text
                  style={styles.txSignature}
                  numberOfLines={1}
                  ellipsizeMode="middle"
                >
                  {txSignature}
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.solscanButton}
              onPress={handleViewOnSolscan}
            >
              <FontAwesome5 name="external-link-alt" size={16} color="#FFF" />
              <Text style={styles.solscanButtonText}>View on Solscan</Text>
            </TouchableOpacity>

            <Button
              title="Done"
              onPress={handleCloseSuccess}
              variant="outline"
              style={styles.doneButton}
            />
          </View>
        </View>
      </Modal>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Settle Up</Text>
          <Text style={styles.subtitle}>
            Pay your friends securely on Solana
          </Text>
        </View>

        <View style={styles.form}>
          <View style={styles.checkoutBanner}>
            <FontAwesome5 name="wallet" size={24} color={colors.secondary} />
            <Text style={styles.checkoutText}>Solana Devnet TX</Text>
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {members.length === 0 ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <View style={styles.pickerContainer}>
              <Text style={styles.pickerLabel}>Who are you paying?</Text>
              <View style={styles.pickerWrapper}>
                <Picker
                  selectedValue={toUserId}
                  onValueChange={(itemValue) => setToUserId(itemValue)}
                  style={styles.picker}
                  dropdownIconColor={colors.primary}
                >
                  {members.map((m) => (
                    <Picker.Item
                      key={m._id}
                      label={m.name || m.username}
                      value={m._id}
                    />
                  ))}
                </Picker>
              </View>
            </View>
          )}

          <Button
            title="Check Amount Owed"
            onPress={handleCheckAmount}
            variant="outline"
            style={styles.checkButton}
          />

          <Input
            label="Amount (in USD equivalent)"
            placeholder="0.00"
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
          />

          {amount !== "" &&
            !isNaN(Number(amount)) &&
            Number(amount) > 0 &&
            solPrice !== null && (
              <View style={styles.conversionPreview}>
                <FontAwesome5
                  name="exchange-alt"
                  size={12}
                  color={colors.secondary}
                />
                <Text style={styles.conversionText}>
                  = {(Number(amount) / solPrice).toFixed(6)} SOL at $
                  {solPrice.toFixed(2)}/SOL
                </Text>
              </View>
            )}

          <Button
            title="Sign & Send via Solana"
            onPress={handleSettle}
            loading={loading}
            style={styles.actionButton}
          />

          <Button
            title="Cancel"
            onPress={() => router.back()}
            variant="outline"
            disabled={loading}
          />
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
  checkoutBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    borderRadius: 24,
    marginBottom: 24,
  },
  checkoutText: {
    color: colors.primary,
    marginLeft: 12,
    fontSize: 16,
    fontWeight: "700",
  },
  form: {
    width: "100%",
  },
  checkButton: {
    marginBottom: 16,
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
  pickerContainer: {
    marginBottom: 16,
  },
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
    overflow: "hidden", // Ensures picker doesn't bleed out of rounded corners
  },
  picker: {
    height: 56,
    width: "100%",
    color: colors.text,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 32,
    width: "100%",
    maxWidth: 340,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 8,
  },
  successIconContainer: {
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.primary,
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 16,
    color: colors.textMuted,
    textAlign: "center",
    marginBottom: 24,
  },
  txInfoContainer: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 12,
    padding: 16,
    width: "100%",
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  txLabel: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 6,
    fontWeight: "600",
  },
  txSignature: {
    fontSize: 14,
    color: colors.primary,
    fontFamily: "monospace",
  },
  solscanButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.secondary,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 999,
    width: "100%",
    marginBottom: 12,
  },
  solscanButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "700",
    marginLeft: 10,
  },
  doneButton: {
    width: "100%",
  },
  conversionPreview: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(153, 69, 255, 0.1)",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginTop: 12,
    marginBottom: 16,
  },
  conversionText: {
    marginLeft: 8,
    color: colors.secondary,
    fontSize: 14,
    fontWeight: "600",
  },
  solAmountBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(20, 241, 149, 0.1)",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginBottom: 20,
  },
  solAmountText: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.success,
    marginLeft: 8,
  },
  solRateText: {
    fontSize: 12,
    color: colors.textMuted,
    marginLeft: 8,
  },
});
