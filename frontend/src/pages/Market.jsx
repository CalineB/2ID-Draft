import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { readContract } from "wagmi/actions";
import { config } from "../web3/wagmiConfig.js";

import { CONTRACTS } from "../config/contracts.js";
import TokenFactoryJSON from "../abis/TokenFactory.json";
import HouseTokenJSON from "../abis/HouseSecurityToken.json";

import CrystalButton from "../components/CrystalButton.jsx";

const TokenFactoryABI = TokenFactoryJSON.abi;
const HouseTokenABI = HouseTokenJSON.abi;

function riskClass(riskTier) {
  const r = String(riskTier || "").toLowerCase();
  if (r === "low") return "risk--low";
  if (r === "high") return "risk--high";
  return "risk--med";
}

export default function Market() {
  const [houses, setHouses] = useState([]);
  const [loading, setLoading] = useState(false);

  // ✅ IMPORTANT: lire metaMap via useMemo (sinon état figé + re-render pas propre)
  const metaMap = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("propertyMeta") || "{}");
    } catch {
      return {};
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);

        const count = await readContract(config, {
          address: CONTRACTS.tokenFactory,
          abi: TokenFactoryABI,
          functionName: "getHouseTokenCount",
        });

        const n = Number(count ?? 0n);
        const list = [];

        for (let i = 0; i < n; i++) {
          const tokenAddr = await readContract(config, {
            address: CONTRACTS.tokenFactory,
            abi: TokenFactoryABI,
            functionName: "allHouseTokens",
            args: [i],
          });

          const [name, symbol, totalSupply, maxSupply] = await Promise.all([
            readContract(config, { address: tokenAddr, abi: HouseTokenABI, functionName: "name" }),
            readContract(config, { address: tokenAddr, abi: HouseTokenABI, functionName: "symbol" }),
            readContract(config, { address: tokenAddr, abi: HouseTokenABI, functionName: "totalSupply" }),
            readContract(config, { address: tokenAddr, abi: HouseTokenABI, functionName: "maxSupply" }),
          ]);

          const ts = BigInt(totalSupply ?? 0n);
          const ms = BigInt(maxSupply ?? 0n);
          const progress = ms > 0n ? Number((ts * 100n) / ms) : 0;

          const key = String(tokenAddr).toLowerCase();
          const meta = metaMap[key] || null;

          list.push({
            address: tokenAddr,
            name,
            symbol,
            totalSupply: ts,
            maxSupply: ms,
            progress,
            meta,
          });
        }

        const published = list.filter((h) => h.meta && h.meta.published === true);

        if (!cancelled) setHouses(published);
      } catch (e) {
        console.error("Erreur load market:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [metaMap]);

  if (loading) {
    return (
      <div className="container">
        <div className="card">
          <div className="card__body">
            <p className="muted">Chargement des biens…</p>
          </div>
        </div>
      </div>
    );
  }

  if (!houses.length) {
    return (
      <div className="container">
        <div className="card">
          <div className="card__body" style={{ textAlign: "center" }}>
            <h1>Biens disponibles</h1>
            <p className="muted">Aucun bien n’est encore publié dans le market.</p>
            <p className="muted" style={{ fontSize: ".95rem" }}>
              Publie un bien depuis l’espace admin (bouton “📢 Publier dans le market”).
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="catalogHeader">
        <div>
          <h1 className="catalogTitle">Biens disponibles</h1>
          <div className="catalogMeta">{houses.length} opportunité(s) publiées</div>
        </div>
        <div className="muted">Catalogue • Security tokens • DeFi compliant</div>
      </div>

      {/* ✅ IMPORTANT: on utilise TES classes (dark) -> plus de blanc sur blanc */}
      <div className="cards-grid">
        {houses.map((h) => {
          const meta = h.meta || {};
          const location = [meta.city, meta.country].filter(Boolean).join(", ");
          const price = meta.price ? Number(meta.price) : null;

          // champs "luxe" (optionnels)
          const targetYield = meta.yield ? Number(meta.yield) : null; // %
          const maturity = meta.maturityMonths || meta.maturity || null; // months
          const riskTier = meta.riskTier || meta.risk || "med"; // low/med/high

          return (
            <article key={h.address} className="propertyCard">
              <div
                className="propertyCard__media"
                style={
                  meta.imageDataUrl
                    ? {
                        backgroundImage: `url(${meta.imageDataUrl})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }
                    : undefined
                }
              />

              <div className="propertyCard__body">
                <div className="propertyCard__top">
                  <div>
                    <h2 className="propertyCard__name">{meta.name || h.name}</h2>
                    <div className="propertyCard__sym">
                      {h.symbol} · {location || "—"}
                    </div>
                  </div>

                  <span className={`pill ${riskClass(riskTier)}`}>
                    <span className="pill__label">Risque</span> {String(riskTier).toUpperCase()}
                  </span>
                </div>

                <div className="pills">
                  <span className="pill">
                    <span className="pill__label">Prix</span>{" "}
                    {price !== null ? `${price.toLocaleString("fr-FR")} €` : "—"}
                  </span>

                  <span className="pill">
                    <span className="pill__label">Yield cible</span>{" "}
                    {targetYield !== null ? `${targetYield}%` : "—"}
                  </span>

                  <span className="pill">
                    <span className="pill__label">Maturité</span> {maturity ? `${maturity} mois` : "—"}
                  </span>
                </div>

                <div className="progress">
                  <div className="progress__bar">
                    <div className="progress__fill" style={{ width: `${h.progress}%` }} />
                  </div>
                  <div className="progress__meta">
                    <span>
                      {String(h.totalSupply)} / {String(h.maxSupply)} tokens
                    </span>
                    <span>{h.progress}%</span>
                  </div>
                </div>

                <div className="addr">Token: {h.address}</div>

                <div style={{ marginTop: 6 }}>
                  <Link to={`/house/${h.address}`} style={{ display: "inline-block" }}>
                    <CrystalButton tone="gold" type="button">
                      Voir le détail / Investir
                    </CrystalButton>
                  </Link>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
