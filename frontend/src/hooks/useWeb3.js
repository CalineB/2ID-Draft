import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { ADDRESSES, ABIS, NETWORK_ID } from "../config/contracts";

export function useWeb3() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [address, setAddress] = useState(null);
  const [network, setNetwork] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [contracts, setContracts] = useState({
    tokenFactory: null,
    identityRegistry: null,
    kycRegistry: null,
  });

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      alert("Installe MetaMask pour continuer.");
      return;
    }

    const browserProvider = new ethers.BrowserProvider(window.ethereum);
    await browserProvider.send("eth_requestAccounts", []);
    const signer = await browserProvider.getSigner();
    const net = await browserProvider.getNetwork();
    const addr = await signer.getAddress();

    const tokenFactory = new ethers.Contract(
      ADDRESSES.tokenFactory,
      ABIS.tokenFactory,
      signer
    );
    const identityRegistry = new ethers.Contract(
      ADDRESSES.identityRegistry,
      ABIS.identityRegistry,
      signer
    );
    const kycRegistry = new ethers.Contract(
      ADDRESSES.kycRegistry,
      ABIS.kycRegistry,
      signer
    );

    // admin = owner() de la factory
    let admin = false;
    try {
      const owner = await tokenFactory.owner();
      admin = owner.toLowerCase() === addr.toLowerCase();
    } catch (e) {
      console.error("Impossible de lire owner()", e);
    }

    setProvider(browserProvider);
    setSigner(signer);
    setAddress(addr);
    setNetwork(net);
    setContracts({ tokenFactory, identityRegistry, kycRegistry });
    setIsAdmin(admin);
  }, []);

  // reload si changement compte / réseau
  useEffect(() => {
    if (!window.ethereum) return;

    const onAccountsChanged = () => window.location.reload();
    const onChainChanged = () => window.location.reload();

    window.ethereum.on("accountsChanged", onAccountsChanged);
    window.ethereum.on("chainChanged", onChainChanged);

    return () => {
      window.ethereum.removeListener("accountsChanged", onAccountsChanged);
      window.ethereum.removeListener("chainChanged", onChainChanged);
    };
  }, []);

  return { provider, signer, address, network, contracts, isAdmin, connect };
}
