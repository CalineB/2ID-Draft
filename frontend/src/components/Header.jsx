import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAccount, useConnect, useDisconnect, useReadContract } from "wagmi";

import IdentityJSON from "../abis/IdentityRegistry.json";
import { CONTRACTS } from "../config/contracts.js";
import { useKycStatus } from "../hooks/useKycStatus.js";
import KycBadge from "./KycBadge.jsx";

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

  // Menu mobile
  const [open, setOpen] = useState(false);

  // Ferme le menu quand on change de page
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Choix "smart" du meilleur connector (MetaMask/injected)
  const preferredConnector = useMemo(() => {
    if (!connectors?.length) return null;
    // wagmi injected est souvent le bon (MetaMask, Rabby, etc.)
    const injected = connectors.find((c) => c.type === "injected");
    return injected || connectors[0];
  }, [connectors]);

  return (
    <header className="header">
      <div className="header__left">
        <Link to="/" className="brand" onClick={() => setOpen(false)}>
          <img className="brand__logo" src="/images/2ID_icon.png" alt="2ID" />
          <span className="brand__name">2ID</span>
        </Link>

        {/* NAV desktop */}
        <nav className="nav nav--desktop">
          <Link className={`nav__link ${pathname === "/" ? "is-active" : ""}`} to="/">
            Market
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
        {/* Badge KYC (desktop) */}
        {isConnected && (
          <div className="kycWrap kycWrap--desktop">
            <KycBadge {...kyc} />
          </div>
        )}

        {/* Connexion */}
        {isConnected ? (
          <>
            <span className="badge badge--neutral">🟢 {shortAddr(address)}</span>
            <button className="btn btn--ghost" type="button" onClick={() => disconnect()}>
              Se déconnecter
            </button>
          </>
        ) : (
          <button
            className="btn"
            type="button"
            onClick={() => preferredConnector && connect({ connector: preferredConnector })}
            disabled={!preferredConnector || connectStatus === "pending"}
            title={!preferredConnector ? "Aucun wallet détecté (MetaMask?)" : ""}
          >
            {connectStatus === "pending" ? "Connexion…" : "Se connecter"}
          </button>
        )}

        {/* Burger (mobile) */}
        <button
          className="btn btn--ghost burger"
          type="button"
          aria-label="Ouvrir le menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {/* icône simple */}
          <span className="burger__lines" />
        </button>
      </div>

      {/* NAV mobile */}
      {open && (
        <div className="mobileNav">
          <div className="mobileNav__inner">
            {isConnected && (
              <div className="kycWrap kycWrap--mobile">
                <KycBadge {...kyc} />
              </div>
            )}

            <Link className="mobileNav__link" to="/" onClick={() => setOpen(false)}>
              Market
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
