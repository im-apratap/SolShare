import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  StyleSheet,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { FontAwesome5 } from "@expo/vector-icons";
import { Picker } from "@react-native-picker/picker";
import { Container } from "../../src/components/Container";
import { Input } from "../../src/components/Input";
import { Button } from "../../src/components/Button";
import { colors } from "../../src/theme/colors";
import { apiClient } from "../../src/api/client";
export default function CreateExpenseScreen() {
  const { groupId } = useLocalSearchParams();
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [splitType, setSplitType] = useState("equal");
  const [members, setMembers] = useState<any[]>([]);
  const [shares, setShares] = useState<{ [key: string]: string }>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [permission, requestPermission] = useCameraPermissions();
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const fetchMembers = useCallback(async () => {
    try {
      const res = await apiClient.get(`/groups/${groupId}`);
      setMembers(res.data.data.members || []);
    } catch {
      console.warn("Could not fetch members for split options");
    }
  }, [groupId]);
  useEffect(() => {
    if (groupId) fetchMembers();
  }, [groupId, fetchMembers]);
  const handleShareChange = (userId: string, value: string) => {
    setShares((prev) => ({ ...prev, [userId]: value }));
  };
  const handleAddExpense = async () => {
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
    setLoading(true);
    setError("");
    try {
      await apiClient.post("/expenses", {
        groupId,
        description,
        amount: Number(amount),
        currency,
        splitType,
        shares: sharesPayload.length > 0 ? sharesPayload : undefined,
      });
      router.back();
    } catch (err: any) {
      setError(
        err.response?.data?.message || err.message || "Failed to add expense",
      );
    } finally {
      setLoading(false);
    }
  };
  const handleOpenCamera = async () => {
    if (!permission?.granted) {
      const { granted } = await requestPermission();
      if (!granted) {
        setError("Camera permission is required to scan bills.");
        return;
      }
    }
    setError("");
    setIsCameraActive(true);
  };
  const takePicture = async () => {
    if (!cameraRef.current) return;
    setIsScanning(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.5,
        base64: false,
      });
      if (!photo?.uri) throw new Error("Failed to capture image");
      const manipulated = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: 800 } }],
        {
          compress: 0.7,
          format: ImageManipulator.SaveFormat.JPEG,
          base64: true,
        },
      );
      const response = await apiClient.post("/bill/scan", {
        image: `data:image/jpeg;base64,${manipulated.base64}`,
      });
      const {
        description: scannedDesc,
        totalAmount,
        currency: scannedCurrency,
      } = response.data.data;
      if (scannedDesc) setDescription(scannedDesc);
      if (totalAmount !== undefined && totalAmount !== null)
        setAmount(totalAmount.toString());
      if (scannedCurrency) setCurrency(scannedCurrency.toUpperCase());

      setIsCameraActive(false);
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          err.message ||
          "Failed to scan bill. Try taking a clearer photo.",
      );
    } finally {
      setIsScanning(false);
    }
  };
  const uploadFromGallery = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 1,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        setIsScanning(true);
        const photoUri = result.assets[0].uri;
        const manipulated = await ImageManipulator.manipulateAsync(
          photoUri,
          [{ resize: { width: 800 } }],
          {
            compress: 0.7,
            format: ImageManipulator.SaveFormat.JPEG,
            base64: true,
          },
        );
        const response = await apiClient.post("/bill/scan", {
          image: `data:image/jpeg;base64,${manipulated.base64}`,
        });
        const {
          description: scannedDesc,
          totalAmount,
          currency: scannedCurrency,
        } = response.data.data;
        if (scannedDesc) setDescription(scannedDesc);
        if (totalAmount !== undefined && totalAmount !== null)
          setAmount(totalAmount.toString());
        if (scannedCurrency) setCurrency(scannedCurrency.toUpperCase());
      }
    } catch (err: any) {
      setError(
        err.response?.data?.message ||
          err.message ||
          "Failed to analyze uploaded bill.",
      );
    } finally {
      setIsScanning(false);
    }
  };
  if (isCameraActive) {
    return (
      <View style={styles.cameraContainer}>
        <CameraView ref={cameraRef} style={styles.camera} facing="back">
          <View style={styles.cameraOverlay}>
            <TouchableOpacity
              style={styles.closeCameraBtn}
              onPress={() => setIsCameraActive(false)}
            >
              <FontAwesome5 name="times" size={24} color="#FFF" />
            </TouchableOpacity>
            <View style={styles.scanTargetGroup}>
              <FontAwesome5
                name="receipt"
                size={48}
                color="rgba(255,255,255,0.5)"
              />
              <Text style={styles.scanTargetText}>
                Position bill inside frame
              </Text>
            </View>
            <View style={styles.cameraControls}>
              {isScanning ? (
                <View style={styles.scanningBadge}>
                  <ActivityIndicator color="#FFF" />
                  <Text style={styles.scanningText}>Analyzing...</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.captureBtn}
                  onPress={takePicture}
                >
                  <View style={styles.captureBtnInner} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </CameraView>
      </View>
    );
  }
  return (
    <Container>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Add Expense</Text>
          <Text style={styles.subtitle}>Split a new bill with the group</Text>
        </View>
        <View style={styles.form}>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <View style={styles.aiButtonsRow}>
            <TouchableOpacity
              style={[styles.aiScanButton, styles.aiButtonHalf]}
              onPress={handleOpenCamera}
            >
              <FontAwesome5 name="camera" size={16} color={colors.primary} />
              <Text style={styles.aiScanText}>Camera</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.aiScanButton, styles.aiButtonHalf]}
              onPress={uploadFromGallery}
            >
              <FontAwesome5 name="image" size={16} color={colors.primary} />
              <Text style={styles.aiScanText}>Gallery</Text>
            </TouchableOpacity>
          </View>
          {isScanning && !isCameraActive && (
            <View style={styles.inlineScanningBadge}>
              <ActivityIndicator color={colors.primary} size="small" />
              <Text style={styles.inlineScanningText}>
                Gemini AI is analyzing your receipt...
              </Text>
            </View>
          )}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR ENTER MANUALLY</Text>
            <View style={styles.dividerLine} />
          </View>
          <Input
            label="Description"
            placeholder="Dinner, Taxi, Groceries..."
            value={description}
            onChangeText={setDescription}
          />
          <View style={styles.amountContainer}>
            <View style={styles.amountInputWrapper}>
              <Input
                label="Amount"
                placeholder="0.00"
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                containerStyle={{ marginBottom: 0 }}
              />
            </View>
            <View style={styles.currencySelectWrapper}>
              <Text style={styles.pickerLabel}>Currency</Text>
              <View style={styles.currencyPicker}>
                <Picker
                  selectedValue={currency}
                  onValueChange={(itemValue) => setCurrency(itemValue)}
                  dropdownIconColor={colors.primary}
                  style={styles.picker}
                >
                  <Picker.Item label="USD ($)" value="USD" />
                  <Picker.Item label="INR (₹)" value="INR" />
                </Picker>
              </View>
            </View>
          </View>
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
                    ? `Enter Custom Amounts (${currency === "INR" ? "₹" : "$"})`
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
            title="Add Expense"
            onPress={handleAddExpense}
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
    marginBottom: 24,
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
  aiButtonsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  amountContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginBottom: 16,
    gap: 12,
  },
  amountInputWrapper: {
    flex: 2,
  },
  currencySelectWrapper: {
    flex: 1,
    marginBottom: 4,
  },
  currencyPicker: {
    backgroundColor: colors.surfaceLight,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    height: 56,
    justifyContent: "center",
  },
  aiButtonHalf: {
    flex: 1,
    marginHorizontal: 4,
    marginBottom: 0,
  },
  aiScanButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 16,
    borderRadius: 24,
  },
  aiScanText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.primary,
    marginLeft: 10,
  },
  inlineScanningBadge: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(153, 69, 255, 0.1)",
    padding: 12,
    borderRadius: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "rgba(153, 69, 255, 0.2)",
  },
  inlineScanningText: {
    marginLeft: 10,
    color: colors.secondary,
    fontWeight: "600",
    fontSize: 14,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
    letterSpacing: 1,
  },
  actionButton: {
    marginTop: 8,
    marginBottom: 12,
  },
  errorText: {
    color: colors.error,
    textAlign: "center",
    marginBottom: 16,
    fontSize: 14,
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: "#000",
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "space-between",
  },
  closeCameraBtn: {
    marginTop: 60,
    marginLeft: 24,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  scanTargetGroup: {
    alignItems: "center",
    justifyContent: "center",
  },
  scanTargetText: {
    color: "#FFF",
    marginTop: 16,
    fontSize: 16,
    fontWeight: "600",
    textShadowColor: "rgba(0, 0, 0, 0.75)",
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 10,
  },
  cameraControls: {
    height: 140,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 40,
  },
  captureBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: "rgba(255,255,255,0.3)",
    alignItems: "center",
    justifyContent: "center",
  },
  captureBtnInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#FFF",
  },
  scanningBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 999,
  },
  scanningText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 12,
  },
  pickerContainer: {
    marginBottom: 24,
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
    overflow: "hidden",
  },
  picker: {
    height: 56,
    width: "100%",
    color: colors.text,
  },
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
  shareName: {
    fontSize: 14,
    color: colors.text,
    flex: 1,
    fontWeight: "600",
  },
  shareInputContainer: {
    width: 100,
    marginVertical: 0,
  },
  shareInput: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    height: 44,
  },
});
