import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { readContract } from "wagmi/actions";
import { config } from "../web3/wagmiConfig.js";

import { CONTRACTS } from "../config/contracts.js";
import TokenFactoryJSON from "../abis/TokenFactory.json";
import HouseTokenJSON from "../abis/HouseSecurityToken.json";

const TokenFactoryABI = TokenFactoryJSON.abi;
const HouseTokenABI = HouseTokenJSON.abi;

export default function Market() {
  const [houses, setHouses] = useState([]);
  const [loading, setLoading] = useState(false);

  const [metaMap] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("propertyMeta") || "{}");
    } catch {
      return {};
    }
  });

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);

        // 1) nombre de tokens créés par la factory
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
            readContract(config, {
              address: tokenAddr,
              abi: HouseTokenABI,
              functionName: "name",
            }),
            readContract(config, {
              address: tokenAddr,
              abi: HouseTokenABI,
              functionName: "symbol",
            }),
            readContract(config, {
              address: tokenAddr,
              abi: HouseTokenABI,
              functionName: "totalSupply",
            }),
            readContract(config, {
              address: tokenAddr,
              abi: HouseTokenABI,
              functionName: "maxSupply",
            }),
          ]);

          const ts = totalSupply ?? 0n;
          const ms = maxSupply ?? 0n;
          const progress = ms > 0n ? Number((ts * 100n) / ms) : 0;

          const key = tokenAddr.toLowerCase();
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

        const published = list.filter(
          (h) => h.meta && h.meta.published === true
        );

        setHouses(published);
      } catch (e) {
        console.error("Erreur load market:", e);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [metaMap]);

  if (loading) {
    return <p>Chargement des biens...</p>;
  }

  if (!houses.length) {
    return (
      <div style={{ maxWidth: 900, margin: "0 auto", textAlign: "center" }}>
        <h1>Biens disponibles</h1>
        <p>Aucun bien n&apos;est encore publié dans le market.</p>
        <p style={{ fontSize: "0.9rem", color: "#666" }}>
          Publie un bien depuis l&apos;espace admin (bouton &quot;📢 Publier
          dans le market&quot;).
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ textAlign: "center", marginBottom: "1.5rem" }}>
        Biens disponibles
      </h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: "1.5rem",
          justifyItems: "center",
        }}
      >
        {houses.map((h) => {
          const meta = h.meta || {};
          return (
            <div
              key={h.address}
              style={{
                width: "100%",
                maxWidth: 320,
                border: "1px solid #ddd",
                borderRadius: 12,
                padding: "0.75rem",
                boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                background: "#fff",
              }}
            >
              {meta.imageDataUrl && (
                <div
                  style={{
                    width: "100%",
                    marginBottom: "0.5rem",
                    display: "flex",
                    justifyContent: "center",
                  }}
                >
                  <img
                    src={meta.imageDataUrl}
                    alt={meta.addressLine || h.name}
                    style={{
                      width: "100%",
                      height: 180,
                      objectFit: "cover",
                      borderRadius: 10,
                    }}
                  />
                </div>
              )}

              <div style={{ flexGrow: 1 }}>
                <h2 style={{ margin: "0 0 0.25rem 0", fontSize: "1.1rem" }}>
                  {h.name}
                </h2>
                <p style={{ margin: 0, color: "#555", fontSize: "0.9rem" }}>
                  {meta.addressLine && (
                    <>
                      {meta.addressLine}
                      <br />
                    </>
                  )}
                  {meta.city && meta.country && (
                    <>
                      {meta.city}, {meta.country}
                    </>
                  )}
                </p>

                <p style={{ margin: "0.5rem 0", fontSize: "0.9rem" }}>
                  <strong>Security Token :</strong> {h.symbol}
                  <br />
                  <strong>Tokens vendus :</strong>{" "}
                  {String(h.totalSupply)} / {String(h.maxSupply)}
                </p>

                {meta.price && (
                  <p style={{ margin: "0.25rem 0", fontSize: "0.9rem" }}>
                    <strong>Prix du bien :</strong> {meta.price} €
                  </p>
                )}

                <div
                  style={{
                    background: "#eee",
                    height: 8,
                    borderRadius: 4,
                    overflow: "hidden",
                    margin: "0.5rem 0",
                  }}
                >
                  <div
                    style={{
                      width: `${h.progress}%`,
                      height: "100%",
                      background: "#4caf50",
                    }}
                  />
                </div>
                <p style={{ margin: "0 0 0.5rem 0", fontSize: "0.9rem" }}>
                  Avancement : {h.progress}%
                </p>
              </div>

              <div style={{ textAlign: "center", marginTop: "0.5rem" }}>
                <Link to={`/house/${h.address}`}>
                  <button
                    style={{
                      padding: "0.4rem 0.8rem",
                      borderRadius: 999,
                      border: "none",
                      background: "#111827",
                      color: "#fff",
                      cursor: "pointer",
                      fontSize: "0.9rem",
                    }}
                  >
                    Voir le détail / Investir
                  </button>
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
