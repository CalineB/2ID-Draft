// src/hooks/useKycStatus.js
import { useMemo } from "react";
import { useAccount, useReadContract } from "wagmi";

import IdentityJSON from "../abis/IdentityRegistry.json";
import KYCJSON from "../abis/KYCRequestRegistry.json";
import { CONTRACTS } from "../config/contracts.js";

const IdentityABI = IdentityJSON.abi;
const KYCABI = KYCJSON.abi;

function isValidAddress(addr) {
  return typeof addr === "string" && addr.startsWith("0x") && addr.length === 42;
}

export function useKycStatus(targetAddress) {
  const { address } = useAccount();
  const wallet = targetAddress || address;

  const enabled = isValidAddress(wallet);

  const { data: req } = useReadContract({
    address: CONTRACTS.kycRequestRegistry,
    abi: KYCABI,
    functionName: "requests",
    args: enabled ? [wallet] : undefined,
    query: { enabled },
  });

  const { data: isVerified } = useReadContract({
    address: CONTRACTS.identityRegistry,
    abi: IdentityABI,
    functionName: "isVerified",
    args: enabled ? [wallet] : undefined,
    query: { enabled },
  });

  return useMemo(() => {
    let exists = false;
    let approved = false;
    let rejected = false;
    let kycHash = null;

    if (Array.isArray(req) && req.length >= 4) {
      kycHash = req[0];
      exists = Boolean(req[1]);
      approved = Boolean(req[2]);
      rejected = Boolean(req[3]);
    }

    return {
      wallet,
      exists,
      approved,
      rejected,
      isVerified: Boolean(isVerified),
      kycHash,
    };
  }, [wallet, req, isVerified]);
}
