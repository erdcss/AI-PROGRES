import { useEffect, useState } from "react";
import NetInfo from "@react-native-community/netinfo";

export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const sub = NetInfo.addEventListener((state) => {
      setOnline(Boolean(state.isConnected && state.isInternetReachable !== false));
    });
    return () => sub();
  }, []);
  return online;
}
