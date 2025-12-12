import React, { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  useAccount,
  useReadContract,
  useConnect,
  useDisconnect,
} from "wagmi";
import IdentityJSON from "../abis/IdentityRegistry.json";
import { CONTRACTS } from "../config/contracts.js";

const IdentityABI = IdentityJSON.abi;

function shortAddr(a) {
  if (!a) return "";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function Badge({ children, tone = "neutral" }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

export default function Header() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const location = useLocation();

  const { data: ownerAddress } = useReadContract({
    address: CONTRACTS.identityRegistry,
    abi: IdentityABI,
    functionName: "owner",
  });

  const { data: isVerified } = useReadContract({
    address: CONTRACTS.identityRegistry,
    abi: IdentityABI,
    functionName: "isVerified",
    args: isConnected && address ? [address] : undefined,
    query: { enabled: Boolean(isConnected && address) },
  });

  const isAdmin =
    isConnected &&
    address &&
    ownerAddress &&
    address.toLowerCase() === ownerAddress.toLowerCase();

  const injected = useMemo(() => {
    // “injected” = MetaMask/Rabby/Trustwallet...Dex
    return connectors.find((c) => c.id === "injected") || connectors[0];
  }, [connectors]);

  const linkCls = (path) =>
    `nav__link ${location.pathname === path ? "nav__link--active" : ""}`;

  return (
    <header className="header">
      <div className="header__inner">
        <div className="brand">
          <div className="brand__logo">2ID</div>
        </div>

        <nav className="nav">
          <Link className={linkCls("/market")} to="/market">
            Market
          </Link>
          <Link className={linkCls("/kyc")} to="/kyc">
            KYC
          </Link>
          <Link className={linkCls("/dashboard")} to="/dashboard">
            Dashboard
          </Link>
          {isAdmin && (
            <Link className={linkCls("/admin")} to="/admin">
              Admin
            </Link>
          )}
        </nav>

        <div className="header__right">
          {isAdmin && <Badge tone="admin">Admin</Badge>}

          {isConnected ? (
            <>
              <Badge tone="ok">Connecté · {shortAddr(address)}</Badge>
              <Badge tone={isVerified ? "ok" : "warn"}>
                KYC {isVerified ? "Validé" : "Non validé"}
              </Badge>

              <button
                className="btn btn--ghost"
                onClick={() => disconnect()}
                type="button"
              >
                Se déconnecter
              </button>
            </>
          ) : (
            <>
              <Badge tone="danger">Wallet non connecté</Badge>
              <button
                className="btn"
                type="button"
                disabled={!injected || isConnecting}
                onClick={() => connect({ connector: injected })}
                title={!injected ? "Aucun wallet détecté (MetaMask/Rabby...)" : ""}
              >
                {isConnecting ? "Connexion..." : "Se connecter"}
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
