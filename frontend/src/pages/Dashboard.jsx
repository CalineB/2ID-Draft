import React from "react";
import { useAccount, useReadContract } from "wagmi";
import { CONTRACTS } from "../config/contracts.js";
import IdentityJSON from "../abis/IdentityRegistry.json";

const IdentityABI = IdentityJSON.abi;

export default function Dashboard() {
  const { address, isConnected } = useAccount();

  const { data: isVerified } = useReadContract({
    address: CONTRACTS.identityRegistry,
    abi: IdentityABI,
    functionName: "isVerified",
    args: address ? [address] : undefined,
    query: { enabled: isConnected && !!address },
  });

  if (!isConnected) {
    return (
      <div className="container">
        <div className="card">
          <div className="card__body">
            <h1 style={{ marginBottom: 8 }}>Espace investisseur</h1>
            <p className="muted">Connecte ton wallet pour accéder à ton espace et suivre tes positions.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ display: "grid", gap: 14 }}>
      <div className="card">
        <div className="card__body">
          <h1 style={{ marginBottom: 10 }}>Mon espace investisseur</h1>
          <div className="pill">
            <span className="pill__label">Wallet</span>
            <span className="addr" style={{ maxWidth: 520 }}>{address}</span>
          </div>

          <div className="divider" />

          <h2 style={{ marginBottom: 10 }}>Statut KYC</h2>
          {isVerified ? (
            <div className="pill risk--low">✅ Vérifié — autorisé à investir</div>
          ) : (
            <div className="pill risk--med">⏳ En attente — consulte l’onglet KYC</div>
          )}
        </div>
      </div>

      <div className="cards-grid">
        <div className="propertyCard">
          <div className="propertyCard__media" />
          <div className="propertyCard__body">
            <h3 className="propertyCard__name">Mes investissements</h3>
            <p className="muted" style={{ margin: 0 }}>
              Ici tu affiches la liste de tes tokens (HouseSecurityToken / HouseEthSale).
            </p>
            <div className="divider" />
            <div className="pills">
              <div className="pill"><span className="pill__label">Positions</span> —</div>
              <div className="pill"><span className="pill__label">Exposition</span> —</div>
              <div className="pill"><span className="pill__label">Rendement estimé</span> —</div>
            </div>
          </div>
        </div>

        <div className="propertyCard">
          <div className="propertyCard__media" />
          <div className="propertyCard__body">
            <h3 className="propertyCard__name">Distribution & cashflows</h3>
            <p className="muted" style={{ margin: 0 }}>
              Historique des coupons / distributions (on-chain events).
            </p>
          </div>
        </div>

        <div className="propertyCard">
          <div className="propertyCard__media" />
          <div className="propertyCard__body">
            <h3 className="propertyCard__name">Documents</h3>
            <p className="muted" style={{ margin: 0 }}>
              Term sheet, conformité, reportings (PDF/IPFS).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
