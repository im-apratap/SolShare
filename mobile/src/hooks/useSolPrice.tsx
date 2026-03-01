import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  ReactNode,
} from "react";
import { apiClient } from "../api/client";

const POLL_INTERVAL_MS = 30_000; // 30 seconds

type SolPriceState = {
  solPrice: number | null;
  loading: boolean;
  lastUpdated: Date | null;
};

const SolPriceContext = createContext<SolPriceState>({
  solPrice: null,
  loading: true,
  lastUpdated: null,
});

export const SolPriceProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<SolPriceState>({
    solPrice: null,
    loading: true,
    lastUpdated: null,
  });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchPrice = useCallback(async () => {
    try {
      const res = await apiClient.get("/settlements/sol-price");
      const { priceUSD, updatedAt } = res.data.data;
      setState({
        solPrice: priceUSD,
        loading: false,
        lastUpdated: new Date(updatedAt),
      });
    } catch {
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, []);

  useEffect(() => {
    // Immediate fetch on mount
    fetchPrice();
    // Start interval
    intervalRef.current = setInterval(fetchPrice, POLL_INTERVAL_MS);
    return () => {
      // Cleanup on unmount
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchPrice]);

  return (
    <SolPriceContext.Provider value={state}>
      {children}
    </SolPriceContext.Provider>
  );
};

export const useSolPrice = () => {
  return useContext(SolPriceContext);
};
