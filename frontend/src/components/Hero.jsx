import React from "react";
import { Link } from "react-router-dom";
import CrystalButton from "./CrystalButton.jsx";

export default function Hero({
  title,
  lead,
  eyebrow = "Institutional-grade real estate • Tokenized bonds",
  videoSrc,
  imageSrc,
}) {
  return (
    <section className="hero">
      {videoSrc ? (
        <video className="hero__media" src={videoSrc} autoPlay muted loop playsInline />
      ) : (
        <img className="hero__media" src={imageSrc} alt="" />
      )}
      <div className="hero__veil" />

      <div className="hero__grid">
        <div className="hero__glass hero__left">
          <div className="hero__eyebrow">{eyebrow}</div>
          <h1 className="hero__title">{title}</h1>
          <p className="hero__lead">{lead}</p>

          <div className="hero__actions">
            <Link to="/market">
              <CrystalButton tone="gold">Explorer le catalogue</CrystalButton>
            </Link>
            <Link to="/kyc">
              <CrystalButton tone="blue" variant="ghost">
                Démarrer le KYC
              </CrystalButton>
            </Link>
          </div>
        </div>

        <div className="hero__glass hero__right">
          <div className="pill">
            <span className="pill__label">Accès</span> Investisseurs KYC
          </div>
          <div className="pill">
            <span className="pill__label">Instruments</span> Obligations tokenisées
          </div>
          <div className="pill">
            <span className="pill__label">Distribution</span> Automatisée on-chain
          </div>
          <div className="pill">
            <span className="pill__label">Conformité</span> Restrictions transferts
          </div>
        </div>
      </div>
    </section>
  );
}
