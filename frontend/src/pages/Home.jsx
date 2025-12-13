import React from "react";
import { Link } from "react-router-dom";
import CrystalButton from "../components/CrystalButton.jsx";

export default function Home() {
  return (
    <div className="container">
      <div className="card">
        <div className="card__body">
          <h1 className="heroTitle">
            Investir dans l’immobilier <span className="spark">multi-million</span>, simplement.
          </h1>

          <p className="heroKicker">
            Accède à des biens premium via des <strong>obligations tokenisées</strong>. Transparence on-chain,
            distribution automatisée, et conformité intégrée.
          </p>

          <div className="divider" />

          <div className="grid gap-md" style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))" }}>
            <div className="card" style={{ background: "rgba(255,255,255,.05)" }}>
              <div className="card__body">
                <div className="muted">Ticket minimum</div>
                <div style={{ fontSize: "1.35rem", fontWeight: 800 }}>À partir de 0.05 ETH</div>
              </div>
            </div>
            <div className="card" style={{ background: "rgba(255,255,255,.05)" }}>
              <div className="card__body">
                <div className="muted">Structure</div>
                <div style={{ fontSize: "1.35rem", fontWeight: 800 }}>Obligations tokenisées</div>
              </div>
            </div>
            <div className="card" style={{ background: "rgba(255,255,255,.05)" }}>
              <div className="card__body">
                <div className="muted">Conformité</div>
                <div style={{ fontSize: "1.35rem", fontWeight: 800 }}>KYC + restrictions</div>
              </div>
            </div>
          </div>

          <div className="divider" />

          <h2 style={{ marginBottom: 10 }}>Comment ça marche ?</h2>
          <ol className="muted" style={{ lineHeight: 1.75, marginTop: 0 }}>
            <li>Connexion wallet (MetaMask/Rabby…)</li>
            <li>KYC pour vérifier ton identité</li>
            <li>Sélection d’un bien et investissement en ETH</li>
            <li>Réception de tokens représentant ta part</li>
          </ol>

          <p className="muted" style={{ marginTop: 10 }}>
            Les transferts sont restreints aux investisseurs KYC pour respecter les contraintes de conformité (PSFP, AMF).
          </p>

          <div className="flex gap-md" style={{ marginTop: 18, flexWrap: "wrap" }}>
            <Link to="/market">
              <CrystalButton tone="gold">Voir les biens disponibles</CrystalButton>
            </Link>
            <Link to="/kyc">
              <CrystalButton tone="blue" variant="ghost">Démarrer le KYC</CrystalButton>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
