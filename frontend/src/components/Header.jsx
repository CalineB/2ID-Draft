import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAccount, useConnect, useDisconnect, useReadContract } from "wagmi";

import IdentityJSON from "../abis/IdentityRegistry.json";
import { CONTRACTS } from "../config/contracts.js";
import { useKycStatus } from "../hooks/useKycStatus.js";
import KycBadge from "./KycBadge.jsx";
import CrystalButton from "./CrystalButton.jsx";

const IdentityABI = IdentityJSON.abi;

function shortAddr(a) {
  if (!a) return "";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export default function Header() {
  const { pathname } = useLocation();
  const { address, isConnected } = useAccount();

  const { connectors, connect, status: connectStatus } = useConnect();
  const { disconnect } = useDisconnect();

  const { data: ownerAddress } = useReadContract({
    address: CONTRACTS.identityRegistry,
    abi: IdentityABI,
    functionName: "owner",
  });

  const isAdmin =
    isConnected &&
    address &&
    ownerAddress &&
    address.toLowerCase() === ownerAddress.toLowerCase();

  const kyc = useKycStatus(address);

  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  const preferredConnector = useMemo(() => {
    if (!connectors?.length) return null;
    const injected = connectors.find((c) => c.type === "injected");
    return injected || connectors[0];
  }, [connectors]);

  return (
    <header className="header">
      <div className="header__inner">
        <div className="header__left">
          <Link to="/" className="brand" onClick={() => setOpen(false)}>
            <img className="brand__logo" src="/images/logo_2ID.svg" alt="2ID" />
          </Link>

          <nav className="nav nav--desktop">
            <Link className={`nav__link ${pathname === "/market" ? "is-active" : ""}`} to="/market">
              Nos Offres
            </Link>
            <Link className={`nav__link ${pathname === "/kyc" ? "is-active" : ""}`} to="/kyc">
              KYC
            </Link>
            {isAdmin && (
              <Link className={`nav__link ${pathname === "/admin" ? "is-active" : ""}`} to="/admin">
                Admin
              </Link>
            )}
          </nav>
        </div>

        <div className="header__right">
          {isConnected && <KycBadge {...kyc} />}

          {isConnected ? (
            <>
              <span className="badge">🟢 {shortAddr(address)}</span>
              <CrystalButton tone="blue" variant="ghost" type="button" onClick={() => disconnect()}>
                Se déconnecter
              </CrystalButton>
            </>
          ) : (
            <CrystalButton
              tone="gold"
              type="button"
              onClick={() => preferredConnector && connect({ connector: preferredConnector })}
              disabled={!preferredConnector || connectStatus === "pending"}
              title={!preferredConnector ? "Aucun wallet détecté (MetaMask?)" : ""}
            >
              {connectStatus === "pending" ? "Connexion…" : "Se connecter"}
            </CrystalButton>
          )}

          <CrystalButton
            tone="blue"
            variant="ghost"
            className="burger"
            type="button"
            aria-label="Ouvrir le menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <span className="burger__lines" />
          </CrystalButton>
        </div>
      </div>

      {open && (
        <div className="mobileNav">
          <div className="mobileNav__inner">
            {isConnected && <KycBadge {...kyc} />}

            <Link className="mobileNav__link" to="/market" onClick={() => setOpen(false)}>
              Nos biens
            </Link>
            <Link className="mobileNav__link" to="/kyc" onClick={() => setOpen(false)}>
              KYC
            </Link>
            {isAdmin && (
              <Link className="mobileNav__link" to="/admin" onClick={() => setOpen(false)}>
                Admin
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
