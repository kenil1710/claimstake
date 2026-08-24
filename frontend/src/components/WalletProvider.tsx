"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import {
  CHAIN_ID_HEX,
  ensureCorrectNetwork,
  getReadClient,
  getWalletChainId,
  hasInjectedWallet,
  requestAccount,
} from "@/lib/genlayer";

interface WalletState {
  account: `0x${string}` | null;
  balance: bigint | null;
  chainId: string | null;
  onWrongNetwork: boolean;
  hasWallet: boolean;
  connecting: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchNetwork: () => Promise<void>;
  refreshBalance: () => Promise<void>;
}

const WalletContext = createContext<WalletState | null>(null);

/** Remembers the connection across reloads so a refresh does not log you out. */
const STORAGE_KEY = "claimstake.connected";

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<`0x${string}` | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Whether an injected wallet exists, read through useSyncExternalStore.
   *
   * `window.ethereum` is external state that does not exist during SSR, so it
   * cannot be a `useState` initialiser, and setting it from an effect makes
   * React render twice for a value that was knowable on the first client pass.
   * The server snapshot is `false`, which is also the honest answer there.
   * Extensions inject before hydration and do not come and go afterwards, so
   * there is nothing to subscribe to.
   */
  const hasWallet = useSyncExternalStore(
    () => () => {},
    () => hasInjectedWallet(),
    () => false,
  );

  const refreshBalance = useCallback(async () => {
    if (!account) return setBalance(null);
    try {
      setBalance(await getReadClient().getBalance({ address: account }));
    } catch {
      setBalance(null);
    }
  }, [account]);

  useEffect(() => {
    // Pulling the balance from the chain when the account changes is exactly
    // the "subscribe to an external system" case the rule allows; the setState
    // happens in the async continuation, not synchronously in the effect body,
    // but the rule cannot see through the promise.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshBalance();
  }, [refreshBalance]);

  useEffect(() => {
    if (!account) return;
    void getWalletChainId().then(setChainId);
  }, [account]);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const next = await requestAccount();
      await ensureCorrectNetwork();
      setAccount(next);
      setChainId(await getWalletChainId());
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(/User rejected|4001/i.test(message) ? "You dismissed the wallet prompt." : message);
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAccount(null);
    setBalance(null);
    window.localStorage.removeItem(STORAGE_KEY);
  }, []);

  const switchNetwork = useCallback(async () => {
    try {
      await ensureCorrectNetwork();
      setChainId(await getWalletChainId());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  /**
   * Silent reconnect. `eth_accounts` does NOT prompt — it returns whatever the
   * wallet has already authorised for this origin, so a page load restores the
   * session without throwing a popup at someone who only came to read.
   */
  useEffect(() => {
    if (typeof window === "undefined" || !window.ethereum) return;
    if (window.localStorage.getItem(STORAGE_KEY) !== "1") return;
    void window.ethereum
      .request({ method: "eth_accounts" })
      .then((result) => {
        const accounts = result as string[];
        if (accounts?.length) setAccount(accounts[0] as `0x${string}`);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const provider = window.ethereum;
    if (!provider?.on) return;
    const onAccounts = (...args: unknown[]) => {
      const accounts = args[0] as string[];
      setAccount(accounts?.length ? (accounts[0] as `0x${string}`) : null);
    };
    const onChain = (...args: unknown[]) => setChainId(String(args[0]).toLowerCase());
    provider.on("accountsChanged", onAccounts);
    provider.on("chainChanged", onChain);
    return () => {
      provider.removeListener?.("accountsChanged", onAccounts);
      provider.removeListener?.("chainChanged", onChain);
    };
  }, []);

  const value = useMemo<WalletState>(
    () => ({
      account,
      balance,
      chainId,
      onWrongNetwork: Boolean(account && chainId && chainId !== CHAIN_ID_HEX.toLowerCase()),
      hasWallet,
      connecting,
      error,
      connect,
      disconnect,
      switchNetwork,
      refreshBalance,
    }),
    [account, balance, chainId, hasWallet, connecting, error, connect, disconnect, switchNetwork, refreshBalance],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletState {
  const context = useContext(WalletContext);
  if (!context) throw new Error("useWallet must be used inside <WalletProvider>");
  return context;
}
