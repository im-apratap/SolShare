import { useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export function useCurrencyPreference() {
  const [preferredCurrency, setPreferredCurrency] = useState<"USD" | "INR">(
    "USD",
  );

  useEffect(() => {
    const loadPreference = async () => {
      try {
        const stored = await AsyncStorage.getItem("preferredCurrency");
        if (stored === "USD" || stored === "INR") {
          setPreferredCurrency(stored);
        }
      } catch (error) {
        console.error("Failed to load preferred currency:", error);
      }
    };
    loadPreference();
  }, []);

  const toggleCurrency = async (currency: "USD" | "INR") => {
    try {
      setPreferredCurrency(currency);
      await AsyncStorage.setItem("preferredCurrency", currency);
    } catch (error) {
      console.error("Failed to save preferred currency:", error);
    }
  };

  const getCurrencySymbol = () => {
    return preferredCurrency === "INR" ? "₹" : "$";
  };

  const formatFiat = (
    solAmount: number,
    solPriceUSD: number,
    solPriceINR: number,
  ) => {
    if (preferredCurrency === "INR" && solPriceINR) {
      return `₹${(solAmount * solPriceINR).toFixed(2)}`;
    }
    return `$${(solAmount * (solPriceUSD || 0)).toFixed(2)}`;
  };

  const formatFiatFromUSD = (
    usdAmount: number,
    solPriceUSD: number,
    solPriceINR: number,
  ) => {
    if (preferredCurrency === "INR" && solPriceINR && solPriceUSD) {
      return `₹${(usdAmount * (solPriceINR / solPriceUSD)).toFixed(2)}`;
    }
    return `$${usdAmount.toFixed(2)}`;
  };

  return {
    preferredCurrency,
    toggleCurrency,
    getCurrencySymbol,
    formatFiat,
    formatFiatFromUSD,
  };
}
