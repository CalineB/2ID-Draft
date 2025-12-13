import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useAccount, useWriteContract } from "wagmi";
import { readContract } from "wagmi/actions";
import { formatEther } from "viem";

import { config } from "../web3/wagmiConfig.js";
import { CONTRACTS } from "../config/contracts.js";

import HouseTokenJSON from "../abis/HouseSecurityToken.json";
import SaleJSON from "../abis/HouseEthSale.json";

import { useKycStatus } from "../hooks/useKycStatus.js";
import KycBadge from "../components/KycBadge.jsx";
import CrystalButton from "../components/CrystalButton.jsx";

const HouseTokenABI = HouseTokenJSON.abi;
const SaleABI = SaleJSON.abi;

function isZeroAddress(a) {
  return !a || a === "0x0000000000000000000000000000000000000000";
}

function clampInt(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export default function HouseDetail() {
  const { tokenAddress } = useParams();
  const { address, isConnected } = useAccount();
  const { writeContract, isPending } = useWriteContract();

  const kyc = useKycStatus(address);

  const [loading, setLoading] = useState(true);
  const [tokenInfo, setTokenInfo] = useState(null);
  const [saleInfo, setSaleInfo] = useState(null);

  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // input "parts"
  const [tokenAmount, setTokenAmount] = useState("");
  const parts = clampInt(tokenAmount);

  const [txHash, setTxHash] = useState(null);

  // --- meta off-chain (localStorage) ---
  const meta = useMemo(() => {
    try {
      const allMeta = JSON.parse(localStorage.getItem("propertyMeta") || "{}");
      const key = tokenAddress?.toLowerCase();
      return (key && allMeta[key]) || allMeta[tokenAddress] || null;
    } catch {
      return null;
    }
  }, [tokenAddress]);

  const images = meta?.images || (meta?.imageDataUrl ? [meta.imageDataUrl] : []);
  const mainImage = images.length > 0 ? images[currentImageIndex] || images[0] : null;

  // --- load token info ---
  useEffect(() => {
    if (!tokenAddress) return;

    async function loadTokenAndSale() {
      setLoading(true);
      setTokenInfo(null);
      setSaleInfo(null);
      setTxHash(null);

      try {
        const [name, symbol, totalSupply, maxSupply, saleContract] = await Promise.all([
          readContract(config, { address: tokenAddress, abi: HouseTokenABI, functionName: "name" }),
          readContract(config, { address: tokenAddress, abi: HouseTokenABI, functionName: "symbol" }),
          readContract(config, { address: tokenAddress, abi: HouseTokenABI, functionName: "totalSupply" }),
          readContract(config, { address: tokenAddress, abi: HouseTokenABI, functionName: "maxSupply" }),
          readContract(config, { address: tokenAddress, abi: HouseTokenABI, functionName: "saleContract" }),
        ]);

        const ts = BigInt(totalSupply ?? 0n);
        const ms = BigInt(maxSupply ?? 0n);
        const progress = ms > 0n ? Number((ts * 100n) / ms) : 0;

        const tInfo = { name, symbol, totalSupply: ts, maxSupply: ms, progress, saleContract };
        setTokenInfo(tInfo);

        // sale info (si lié)
        if (saleContract && !isZeroAddress(saleContract)) {
          try {
            const [priceWeiPerToken, saleActive] = await Promise.all([
              readContract(config, { address: saleContract, abi: SaleABI, functionName: "priceWeiPerToken" }),
              readContract(config, { address: saleContract, abi: SaleABI, functionName: "saleActive" }),
            ]);

            setSaleInfo({
              saleContract,
              priceWeiPerToken: BigInt(priceWeiPerToken ?? 0n),
              saleActive: Boolean(saleActive),
            });
          } catch (err) {
            console.error("Erreur lecture sale:", err);
            setSaleInfo({ saleContract, priceWeiPerToken: 0n, saleActive: false, readError: true });
          }
        } else {
          setSaleInfo(null);
        }
      } catch (err) {
        console.error("Erreur load token:", err);
      } finally {
        setLoading(false);
      }
    }

    loadTokenAndSale();
  }, [tokenAddress]);

  // --- computed display ---
  const maxSupplyNum = tokenInfo?.maxSupply ? Number(tokenInfo.maxSupply) : 0;
  const priceEUR = meta?.price ? safeNum(meta.price) : null;

  const pricePerTokenEUR = priceEUR !== null && maxSupplyNum > 0 ? priceEUR / maxSupplyNum : null;
  const percentPerToken = maxSupplyNum > 0 ? 100 / maxSupplyNum : null;

  const requiredWei =
    saleInfo?.priceWeiPerToken && saleInfo.priceWeiPerToken > 0n
      ? BigInt(parts) * saleInfo.priceWeiPerToken
      : 0n;

  const requiredEthString = requiredWei > 0n ? Number(formatEther(requiredWei)).toFixed(6) : null;

  const isLinked = saleInfo?.saleContract && !isZeroAddress(saleInfo.saleContract);

  async function handleBuy(e) {
    e.preventDefault();

    if (!isConnected) return alert("⚠️ Tu dois d’abord connecter ton wallet.");
    if (!kyc.exists) return alert("⚠️ Tu dois soumettre un KYC avant d’investir.");
    if (kyc.rejected) return alert("❌ Ton KYC a été rejeté.");
    if (!kyc.approved) return alert("⏳ Ton KYC est en attente.");
    if (kyc.approved && !kyc.isVerified)
      return alert("⚠️ KYC validé mais achats non autorisés (compte gelé / conformité).");

    if (!isLinked) return alert("Ce bien n'a pas encore de contrat de vente configuré (HouseEthSale).");
    if (saleInfo?.readError) return alert("Contrat de vente trouvé mais lecture impossible (ABI / réseau).");
    if (!saleInfo?.saleActive) return alert("La vente n'est pas active. L’admin/SPV doit activer la vente.");
    if (!parts || parts <= 0) return alert("Choisis un nombre de parts (>= 1).");
    if (!saleInfo?.priceWeiPerToken || saleInfo.priceWeiPerToken <= 0n) return alert("Prix on-chain invalide.");

    try {
      const tx = await writeContract({
        address: saleInfo.saleContract,
        abi: SaleABI,
        functionName: "buyTokens",
        args: [],
        value: requiredWei,
      });

      const hash = typeof tx === "string" ? tx : tx?.hash;
      setTxHash(hash || null);
      alert("Transaction envoyée !");
    } catch (err) {
      console.error(err);
      alert(err?.shortMessage || err?.message || "Erreur achat");
    }
  }

  if (loading || !tokenInfo) {
    return (
      <div className="container">
        <div className="card">
          <div className="card__body">
            <p className="muted">Chargement du bien…</p>
          </div>
        </div>
      </div>
    );
  }

  const title = meta?.name || tokenInfo.name;

  return (
    <div className="container">
      <div className="grid2">
        {/* ------------ COLONNE GAUCHE ------------ */}
        <div>
          <div style={{ marginBottom: 12 }}>
            <Link
              to="/market"
              className="muted"
              style={{ textDecoration: "underline", textUnderlineOffset: 4 }}
            >
              ← Retour au market
            </Link>
          </div>

          {mainImage && (
            <div className="card" style={{ overflow: "hidden" }}>
              <img
                src={mainImage}
                alt={title}
                style={{ width: "100%", height: 360, objectFit: "cover", display: "block" }}
              />
            </div>
          )}

          {images.length > 1 && (
            <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
              {images.map((img, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setCurrentImageIndex(idx)}
                  style={{
                    border: "1px solid rgba(255,255,255,.14)",
                    background: "rgba(255,255,255,.04)",
                    borderRadius: 14,
                    padding: 6,
                    cursor: "pointer",
                    outline: "none",
                    opacity: idx === currentImageIndex ? 1 : 0.75,
                  }}
                  aria-label={`Voir image ${idx + 1}`}
                >
                  <img
                    src={img}
                    alt={`thumbnail-${idx}`}
                    style={{ width: 92, height: 62, objectFit: "cover", borderRadius: 10, display: "block" }}
                  />
                </button>
              ))}
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <h1 style={{ marginBottom: 6 }}>{title}</h1>
            <div className="muted">
              Security token · <strong>{tokenInfo.symbol}</strong>
            </div>

            {meta?.spvName && (
              <div className="card" style={{ marginTop: 14 }}>
                <div className="card__body">
                  <div className="muted">SPV</div>
                  <div style={{ fontWeight: 800, marginTop: 4 }}>{meta.spvName}</div>
                  <div className="muted" style={{ marginTop: 6 }}>
                    {meta.spvRegistration || "—"}
                    {meta.spvContractNumber ? ` · ${meta.spvContractNumber}` : ""}
                  </div>
                </div>
              </div>
            )}

            <div className="card" style={{ marginTop: 14 }}>
              <div className="card__body">
                <div className="muted">
                  {meta?.addressLine ? `${meta.addressLine}, ` : ""}
                  {meta?.city || ""}
                  {meta?.country ? `, ${meta.country}` : ""}
                </div>

                <div
                  style={{
                    marginTop: 10,
                    display: "grid",
                    gap: 10,
                    gridTemplateColumns: "repeat(3, minmax(0,1fr))",
                  }}
                >
                  <div>
                    <div className="muted">Prix (€)</div>
                    <div style={{ fontWeight: 800 }}>{meta?.price || "—"}</div>
                  </div>
                  <div>
                    <div className="muted">Surface (m²)</div>
                    <div style={{ fontWeight: 800 }}>{meta?.sqm || "—"}</div>
                  </div>
                  <div>
                    <div className="muted">Pièces</div>
                    <div style={{ fontWeight: 800 }}>{meta?.rooms || "—"}</div>
                  </div>
                </div>

                <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <div className="pill">
                    <span className="pill__label">Rendement cible</span> {meta?.yield ? `${meta.yield}%` : "—"}
                  </div>
                  {percentPerToken !== null && (
                    <div className="pill">
                      <span className="pill__label">Part / token</span> {percentPerToken.toFixed(4)}%
                    </div>
                  )}
                </div>

                {meta?.description && (
                  <p className="muted" style={{ marginTop: 12, lineHeight: 1.7 }}>
                    {meta.description}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ------------ COLONNE DROITE ------------ */}
        <div
          className="card"
          style={{ position: "sticky", top: 92, alignSelf: "start" }}
        >
          <div className="card__body">
            <div className="flex between">
              <h2 style={{ margin: 0 }}>Investir</h2>
              {isConnected ? (
                <KycBadge {...kyc} />
              ) : (
                <div className="badge badge--warn">⚠️ Wallet non connecté</div>
              )}
            </div>

            <div className="muted" style={{ marginTop: 10 }}>
              Supply : {String(tokenInfo.totalSupply)} / {String(tokenInfo.maxSupply)}
            </div>

            <div className="progress" style={{ marginTop: 10 }}>
              <div className="progress__bar">
                <div className="progress__fill" style={{ width: `${tokenInfo.progress}%` }} />
              </div>
              <div className="progress__meta">
                <span>Avancement</span>
                <span>{tokenInfo.progress}%</span>
              </div>
            </div>

            {pricePerTokenEUR !== null && percentPerToken !== null && (
              <div className="pill" style={{ marginTop: 12 }}>
                1 token = <strong>{pricePerTokenEUR.toFixed(2)} €</strong> ≈{" "}
                <strong>{percentPerToken.toFixed(4)}%</strong> du bien
              </div>
            )}

            <div className="divider" />

            {!isLinked && (
              <div className="badge badge--danger">
                Ce bien n’a pas encore de contrat de vente (HouseEthSale). Contacte l’administrateur.
              </div>
            )}

            {isLinked && saleInfo?.readError && (
              <div className="badge badge--danger">
                Contrat de vente trouvé, mais lecture impossible (ABI / réseau).
              </div>
            )}

            {isLinked && !saleInfo?.readError && (
              <>
                {!saleInfo?.saleActive && (
                  <div className="badge badge--warn" style={{ marginBottom: 10 }}>
                    Vente inactive (saleActive=false). L’admin/SPV doit activer la vente.
                  </div>
                )}

                <form onSubmit={handleBuy} style={{ display: "grid", gap: 12 }}>
                  <div>
                    <label className="label">Nombre de parts (tokens)</label>
                    <input
                      className="input"
                      type="number"
                      min="1"
                      step="1"
                      value={tokenAmount}
                      onChange={(e) => setTokenAmount(e.target.value)}
                      placeholder="Ex: 10"
                    />
                  </div>

                  {parts > 0 && saleInfo?.priceWeiPerToken > 0n && (
                    <div className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
                      Tu achètes <strong>{parts}</strong> part(s).<br />
                      Prix on-chain : <strong>{formatEther(saleInfo.priceWeiPerToken)} ETH</strong> / token.<br />
                      Tu vas envoyer environ <strong>{requiredEthString} ETH</strong>.
                    </div>
                  )}

                  <CrystalButton tone="gold" type="submit" disabled={isPending || !saleInfo?.saleActive}>
                    {isPending ? "Transaction en cours…" : "Acheter des parts"}
                  </CrystalButton>
                </form>

                {txHash && (
                  <div style={{ marginTop: 12 }}>
                    <div className="muted">
                      TX : <code>{txHash}</code>
                    </div>
                    <a
                      className="muted"
                      style={{ textDecoration: "underline", textUnderlineOffset: 4 }}
                      href={`https://sepolia.etherscan.io/tx/${txHash}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Ouvrir sur Etherscan ↗
                    </a>
                  </div>
                )}
              </>
            )}

            <div className="divider" />

            <div className="muted" style={{ fontSize: 13 }}>
              Contrat de vente :{" "}
              <code>{isLinked ? saleInfo?.saleContract : "Aucun"}</code>
            </div>

            {saleInfo?.priceWeiPerToken > 0n && (
              <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                Prix : <strong>{formatEther(saleInfo.priceWeiPerToken)} ETH</strong> / token
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
