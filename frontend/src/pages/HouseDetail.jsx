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
  const priceEUR = meta?.price ? Number(meta.price) : null;

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

  if (loading || !tokenInfo) return <p>Chargement du bien...</p>;

  return (
    <div className="container">
      <div className="grid2">
        {/* ------------ COLONNE GAUCHE ------------ */}
        <div>
          <div style={{ marginBottom: 12 }}>
            <Link to="/market" className="link">
              ← Retour au market
            </Link>
          </div>

          {mainImage && (
            <div className="media">
              <img src={mainImage} alt={tokenInfo.name} className="media__img" />
            </div>
          )}

          {images.length > 1 && (
            <div className="thumbs">
              {images.map((img, idx) => (
                <button
                  key={idx}
                  type="button"
                  className={`thumb ${idx === currentImageIndex ? "is-active" : ""}`}
                  onClick={() => setCurrentImageIndex(idx)}
                >
                  <img src={img} alt={`thumbnail-${idx}`} />
                </button>
              ))}
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <h1 style={{ marginBottom: 6 }}>{meta?.name || tokenInfo.name}</h1>
            <div className="muted">Security token · <strong>{tokenInfo.symbol}</strong></div>

            {meta?.spvName && (
              <div className="card" style={{ marginTop: 14 }}>
                <div className="card__body">
                  <div className="muted">SPV</div>
                  <div style={{ fontWeight: 700, marginTop: 4 }}>{meta.spvName}</div>
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

                <div style={{ marginTop: 10 }} className="grid3">
                  <div>
                    <div className="muted">Prix (€)</div>
                    <div style={{ fontWeight: 700 }}>{meta?.price || "—"}</div>
                  </div>
                  <div>
                    <div className="muted">Surface (m²)</div>
                    <div style={{ fontWeight: 700 }}>{meta?.sqm || "—"}</div>
                  </div>
                  <div>
                    <div className="muted">Obligations</div>
                    <div style={{ fontWeight: 700 }}>{meta?.rooms || "—"}</div>
                  </div>
                </div>

                {meta?.description && <p style={{ marginTop: 12, lineHeight: 1.6 }}>{meta.description}</p>}
              </div>
            </div>
          </div>
        </div>

        {/* ------------ COLONNE DROITE ------------ */}
        <div className="card sticky">
          <div className="card__body">
            <div className="flex between">
              <h2 style={{ margin: 0 }}>Investir</h2>
              {isConnected ? <KycBadge {...kyc} /> : <div className="badge badge--warn">⚠️ Wallet non connecté</div>}
            </div>

            <div className="muted" style={{ marginTop: 10 }}>
              Supply : {String(tokenInfo.totalSupply)} / {String(tokenInfo.maxSupply)}
            </div>

            <div className="progress" style={{ marginTop: 10 }}>
              <div className="progress__bar" style={{ width: `${tokenInfo.progress}%` }} />
            </div>
            <div className="muted" style={{ marginTop: 6 }}>
              Avancement : {tokenInfo.progress}%
            </div>

            {pricePerTokenEUR !== null && percentPerToken !== null && (
              <div className="note" style={{ marginTop: 14 }}>
                1 token = <strong>{pricePerTokenEUR.toFixed(2)} €</strong> ≈{" "}
                <strong>{percentPerToken.toFixed(4)}%</strong> du bien
              </div>
            )}

            <div className="hr" />

            {!isLinked && (
              <div className="badge badge--danger">
                Ce bien n’a pas encore de contrat de vente (HouseEthSale). Contacte l’administrateur.
              </div>
            )}

            {isLinked && saleInfo?.readError && (
              <div className="badge badge--danger">Contrat de vente trouvé, mais lecture impossible (ABI / réseau).</div>
            )}

            {isLinked && !saleInfo?.readError && (
              <>
                {!saleInfo?.saleActive && (
                  <div className="badge badge--warn" style={{ marginBottom: 10 }}>
                    Vente inactive (saleActive=false). L’admin/SPV doit activer la vente.
                  </div>
                )}

                <form onSubmit={handleBuy} className="form">
                  <label className="label">
                    Nombre de parts (tokens)
                    <input
                      className="input"
                      type="number"
                      min="1"
                      step="1"
                      value={tokenAmount}
                      onChange={(e) => setTokenAmount(e.target.value)}
                      placeholder="Ex: 10"
                    />
                  </label>

                  {parts > 0 && saleInfo?.priceWeiPerToken > 0n && (
                    <div className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
                      Tu achètes <strong>{parts}</strong> part(s).<br />
                      Prix on-chain : <strong>{formatEther(saleInfo.priceWeiPerToken)} ETH</strong> / token.<br />
                      Tu vas envoyer environ <strong>{requiredEthString} ETH</strong>.
                    </div>
                  )}

                  <button className="btn btn--primary" type="submit" disabled={isPending || !saleInfo?.saleActive}>
                    {isPending ? "Transaction en cours…" : "Acheter des parts"}
                  </button>
                </form>

                {txHash && (
                  <div style={{ marginTop: 12 }}>
                    <div className="muted">
                      TX : <code>{txHash}</code>
                    </div>
                    <a className="link" href={`https://sepolia.etherscan.io/tx/${txHash}`} target="_blank" rel="noreferrer">
                      Ouvrir sur Etherscan ↗
                    </a>
                  </div>
                )}
              </>
            )}

            <div className="hr" />

            <div className="muted" style={{ fontSize: 13 }}>
              Contrat de vente : <code>{isLinked ? saleInfo?.saleContract : "Aucun"}</code>
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