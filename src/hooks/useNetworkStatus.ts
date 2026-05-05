import { useEffect, useState } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

export interface NetworkStatus {
  isConnected: boolean;
  /** True only when both connected AND server traffic is reachable
   *  (NetInfo's internet-reachability probe). `null` while still detecting. */
  isInternetReachable: boolean | null;
  type: NetInfoState['type'];
}

/**
 * Subscribe to network status. The first emission is async — initial state
 * is "assume connected" so the UI doesn't flash an offline banner on cold
 * boot before NetInfo has answered.
 */
export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>({
    isConnected: true,
    isInternetReachable: null,
    type: 'unknown' as NetInfoState['type'],
  });

  useEffect(() => {
    let cancelled = false;

    // Pull current state once for the initial value.
    NetInfo.fetch().then((s) => {
      if (cancelled) return;
      setStatus({
        isConnected: s.isConnected !== false, // null/undefined → assume connected
        isInternetReachable: s.isInternetReachable,
        type: s.type,
      });
    }).catch((err) => {
      console.warn('[useNetworkStatus] fetch failed:', err);
    });

    const unsub = NetInfo.addEventListener((s) => {
      if (cancelled) return;
      setStatus({
        isConnected: s.isConnected !== false,
        isInternetReachable: s.isInternetReachable,
        type: s.type,
      });
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  return status;
}
