import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useAccount, useWriteContract } from "wagmi";
import { readContract } from "wagmi/actions";
import { formatEther } from "viem";

import { config } from "../web3/wagmiConfig.js";
import { CONTRACTS } from "../config/contracts.js";

import HouseTokenJSON from "../abis/HouseSecurityToken.json";
import IdentityJSON from "../abis/IdentityRegistry.json";
import SaleJSON from "../abis/HouseEthSale.json";

const HouseTokenABI = HouseTokenJSON.abi;
const IdentityABI = IdentityJSON.abi;
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
  const { address, isConnected, chain } = useAccount();
  const { writeContract, isPending } = useWriteContract();

  const [loading, setLoading] = useState(true);

  const [tokenInfo, setTokenInfo] = useState(null);
  const [saleInfo, setSaleInfo] = useState(null);
  const [kycVerified, setKycVerified] = useState(false);

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
              readContract(config, {
                address: saleContract,
                abi: SaleABI,
                functionName: "priceWeiPerToken",
              }),
              readContract(config, {
                address: saleContract,
                abi: SaleABI,
                functionName: "saleActive",
              }),
            ]);

            setSaleInfo({
              saleContract,
              priceWeiPerToken: BigInt(priceWeiPerToken ?? 0n),
              saleActive: Boolean(saleActive),
            });
          } catch (err) {
            console.error("Erreur lecture sale:", err);
            setSaleInfo({
              saleContract,
              priceWeiPerToken: 0n,
              saleActive: false,
              readError: true,
            });
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

  // --- KYC check ---
  useEffect(() => {
    if (!address) {
      setKycVerified(false);
      return;
    }

    async function checkKyc() {
      try {
        const res = await readContract(config, {
          address: CONTRACTS.identityRegistry,
          abi: IdentityABI,
          functionName: "isVerified",
          args: [address],
        });
        setKycVerified(Boolean(res));
      } catch (err) {
        console.error("Erreur check KYC:", err);
        setKycVerified(false);
      }
    }

    checkKyc();
  }, [address]);

  // --- computed display ---
  const maxSupplyNum = tokenInfo?.maxSupply ? Number(tokenInfo.maxSupply) : 0;
  const priceEUR = meta?.price ? Number(meta.price) : null;

  const pricePerTokenEUR =
    priceEUR !== null && maxSupplyNum > 0 ? priceEUR / maxSupplyNum : null;
  const percentPerToken = maxSupplyNum > 0 ? 100 / maxSupplyNum : null;

  const requiredWei =
    saleInfo?.priceWeiPerToken && saleInfo.priceWeiPerToken > 0n
      ? BigInt(parts) * saleInfo.priceWeiPerToken
      : 0n;

  const requiredEthString =
    requiredWei > 0n ? Number(formatEther(requiredWei)).toFixed(6) : null;

  async function handleBuy(e) {
    e.preventDefault();

    if (!isConnected) {
      alert("⚠️ Tu dois d’abord connecter ton wallet.");
      return;
    }
    if (!kycVerified) {
      alert("Ton KYC n'est pas validé. Va sur la page KYC puis attends l'approbation.");
      return;
    }
    if (!saleInfo?.saleContract || isZeroAddress(saleInfo.saleContract)) {
      alert("Ce bien n'a pas encore de contrat de vente configuré (HouseEthSale).");
      return;
    }
    if (!saleInfo.saleActive) {
      alert("La vente n'est pas active. L'admin/SPV doit activer la vente.");
      return;
    }
    if (!parts || parts <= 0) {
      alert("Choisis un nombre de parts (>= 1).");
      return;
    }
    if (!saleInfo.priceWeiPerToken || saleInfo.priceWeiPerToken <= 0n) {
      alert("Prix par token invalide (priceWeiPerToken).");
      return;
    }

    try {
      const tx = await writeContract({
        address: saleInfo.saleContract,
        abi: SaleABI,
        functionName: "buyTokens",
        args: [],
        value: requiredWei,
        // gas: 500000n, // optionnel sî bug
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

  const isLinked = saleInfo?.saleContract && !isZeroAddress(saleInfo.saleContract);

  return (
    <div
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: "1.5rem 1rem",
        display: "grid",
        gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 0.9fr)",
        gap: "2rem",
      }}
    >
      {/* ------------ COLONNE GAUCHE ------------ */}
      <div>
        <div style={{ marginBottom: "0.75rem" }}>
          <Link to="/market" style={{ textDecoration: "none" }}>
            ← Retour au market
          </Link>
        </div>

        {mainImage && (
          <div
            style={{
              width: "100%",
              borderRadius: 16,
              overflow: "hidden",
              marginBottom: "0.75rem",
              border: "1px solid rgba(0,0,0,0.08)",
            }}
          >
            <img
              src={mainImage}
              alt={tokenInfo.name}
              style={{
                width: "100%",
                height: 340,
                objectFit: "cover",
                display: "block",
              }}
            />
          </div>
        )}

        {/* Mini-galerie */}
        {images.length > 1 && (
          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              overflowX: "auto",
              paddingBottom: "0.25rem",
            }}
          >
            {images.map((img, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setCurrentImageIndex(idx)}
                style={{
                  border: idx === currentImageIndex ? "2px solid rgba(0,0,0,0.5)" : "1px solid rgba(0,0,0,0.15)",
                  padding: 0,
                  borderRadius: 10,
                  overflow: "hidden",
                  background: "none",
                  cursor: "pointer",
                  minWidth: 88,
                  maxWidth: 120,
                }}
              >
                <img
                  src={img}
                  alt={`thumbnail-${idx}`}
                  style={{
                    width: "100%",
                    height: 70,
                    objectFit: "cover",
                    display: "block",
                  }}
                />
              </button>
            ))}
          </div>
        )}

        <div style={{ marginTop: "1rem" }}>
          <h1 style={{ marginBottom: 4 }}>{meta?.name || tokenInfo.name}</h1>
          <p style={{ color: "rgba(0,0,0,0.55)", marginTop: 0 }}>
            {tokenInfo.symbol}
          </p>

          {meta && (
            <>
              <p style={{ margin: "0.25rem 0", fontSize: "0.95rem" }}>
                {meta.addressLine ? `${meta.addressLine}, ` : ""}
                {meta.city || ""}
                {meta.country ? `, ${meta.country}` : ""}
              </p>

              {meta.spvName && (
                <div style={{ marginTop: "0.75rem", padding: "0.75rem", borderRadius: 12, border: "1px solid rgba(0,0,0,0.08)", background: "rgba(0,0,0,0.02)" }}>
                  <p style={{ margin: 0, fontWeight: 600 }}>SPV</p>
                  <p style={{ margin: "0.25rem 0" }}>
                    <strong>{meta.spvName}</strong>
                  </p>
                  <p style={{ margin: 0, color: "rgba(0,0,0,0.6)" }}>
                    {meta.spvRegistration ? meta.spvRegistration : ""}
                    {meta.spvContractNumber ? ` · ${meta.spvContractNumber}` : ""}
                  </p>
                </div>
              )}

              <div style={{ marginTop: "0.75rem" }}>
                <p style={{ margin: "0.25rem 0" }}>
                  {meta.price && (
                    <>
                      <strong>Prix du bien :</strong> {meta.price} €{" "}
                      <span style={{ color: "rgba(0,0,0,0.35)" }}>·</span>{" "}
                    </>
                  )}
                  {meta.sqm && (
                    <>
                      <strong>Surface :</strong> {meta.sqm} m²{" "}
                      <span style={{ color: "rgba(0,0,0,0.35)" }}>·</span>{" "}
                    </>
                  )}
                  {meta.rooms && (
                    <>
                      <strong>Obligations :</strong> {meta.rooms}
                    </>
                  )}
                </p>

                {meta.yield && (
                  <p style={{ margin: "0.25rem 0" }}>
                    <strong>Rendement cible :</strong> {meta.yield} %
                  </p>
                )}

                {meta.description && (
                  <p style={{ marginTop: "0.6rem", lineHeight: 1.5 }}>
                    {meta.description}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ------------ COLONNE DROITE ------------ */}
      <div
        style={{
          border: "1px solid rgba(0,0,0,0.12)",
          borderRadius: 16,
          padding: "1rem",
          alignSelf: "flex-start",
          background: "white",
        }}
      >
        <h2 style={{ marginTop: 0 }}>Investir</h2>

        <p style={{ fontSize: "0.9rem", marginBottom: 8 }}>
          Token : <code>{tokenAddress}</code>
        </p>

        <p style={{ fontSize: "0.9rem", marginTop: 0 }}>
          Supply : {String(tokenInfo.totalSupply)} / {String(tokenInfo.maxSupply)} tokens
        </p>

        {/* progress */}
        <div
          style={{
            background: "rgba(0,0,0,0.08)",
            height: 10,
            borderRadius: 999,
            overflow: "hidden",
            marginBottom: 6,
          }}
        >
          <div
            style={{
              width: `${tokenInfo.progress}%`,
              height: "100%",
              background: "rgba(0,0,0,0.55)",
            }}
          />
        </div>
        <p style={{ fontSize: "0.85rem", color: "rgba(0,0,0,0.6)" }}>
          Avancement : {tokenInfo.progress}%
        </p>

        {(pricePerTokenEUR !== null && percentPerToken !== null) && (
          <div
            style={{
              marginTop: "0.75rem",
              padding: "0.75rem",
              borderRadius: 12,
              background: "rgba(0,0,0,0.03)",
              border: "1px solid rgba(0,0,0,0.08)",
            }}
          >
            <p style={{ margin: 0, fontSize: "0.9rem", color: "rgba(0,0,0,0.75)" }}>
              1 token = <strong>{pricePerTokenEUR.toFixed(2)} €</strong> ≈{" "}
              <strong>{percentPerToken.toFixed(4)}%</strong> du bien
            </p>
          </div>
        )}

        <hr style={{ margin: "1rem 0", opacity: 0.25 }} />

        {!isConnected && (
          <p style={{ color: "#b00020" }}>
            ⚠️ Tu dois d’abord connecter ton wallet (bouton en haut).
          </p>
        )}

        {isConnected && !kycVerified && (
          <p style={{ color: "#b00020" }}>
            ⚠️ Ton KYC n’est pas validé. Va sur la page KYC puis attends l’approbation.
          </p>
        )}

        {isConnected && kycVerified && !isLinked && (
          <p style={{ color: "#b00020" }}>
            Ce bien n’a pas encore de contrat de vente configuré (HouseEthSale). Contacte l’administrateur.
          </p>
        )}

        {isConnected && kycVerified && isLinked && saleInfo?.readError && (
          <p style={{ color: "#b00020" }}>
            Contrat de vente trouvé, mais lecture impossible (ABI / adresse / réseau).
          </p>
        )}

        {isConnected && kycVerified && isLinked && !saleInfo?.readError && (
          <>
            {!saleInfo.saleActive && (
              <p style={{ color: "#b00020" }}>
                La vente n’est pas active (saleActive=false). L’admin/SPV doit l’activer.
              </p>
            )}

            <form onSubmit={handleBuy} style={{ display: "grid", gap: "0.6rem", marginTop: "0.5rem" }}>
              <label style={{ display: "grid", gap: 6 }}>
                Nombre de parts (tokens) :
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={tokenAmount}
                  onChange={(e) => setTokenAmount(e.target.value)}
                  placeholder="Ex: 10"
                  style={{
                    width: "100%",
                    padding: "0.65rem 0.75rem",
                    borderRadius: 12,
                    border: "1px solid rgba(0,0,0,0.18)",
                    outline: "none",
                  }}
                />
              </label>

              {/* UX coût */}
              {parts > 0 && saleInfo?.priceWeiPerToken > 0n && (
                <p style={{ fontSize: "0.85rem", color: "rgba(0,0,0,0.65)", margin: 0 }}>
                  Tu achètes <strong>{parts}</strong> token(s).<br />
                  Prix on-chain : <strong>{formatEther(saleInfo.priceWeiPerToken)} ETH</strong> / token.<br />
                  Tu vas envoyer environ <strong>{requiredEthString} ETH</strong> au contrat.
                </p>
              )}

              <button
                type="submit"
                disabled={isPending || !saleInfo.saleActive}
                style={{
                  marginTop: "0.25rem",
                  padding: "0.75rem 0.9rem",
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.18)",
                  background: "rgba(0,0,0,0.9)",
                  color: "white",
                  cursor: "pointer",
                  opacity: isPending || !saleInfo.saleActive ? 0.6 : 1,
                }}
              >
                {isPending ? "Transaction en cours..." : "Acheter des parts"}
              </button>
            </form>
          </>
        )}

        {txHash && (
          <div style={{ marginTop: "0.9rem" }}>
            <p style={{ margin: 0, fontSize: "0.9rem" }}>
              TX : <code>{txHash}</code>
            </p>
            {/* Lien cliquable Etherscan (Sepolia) */}
            <p style={{ margin: "0.35rem 0 0", fontSize: "0.9rem" }}>
              <a
                href={`https://sepolia.etherscan.io/tx/${txHash}`}
                target="_blank"
                rel="noreferrer"
              >
                Ouvrir sur Etherscan ↗
              </a>
            </p>
          </div>
        )}

        <hr style={{ margin: "1rem 0", opacity: 0.25 }} />

        <p style={{ fontSize: "0.85rem", color: "rgba(0,0,0,0.55)", margin: 0 }}>
          Contrat de vente :{" "}
          <code>{isLinked ? saleInfo?.saleContract : "Aucun"}</code>
        </p>
        {saleInfo?.priceWeiPerToken > 0n && (
          <p style={{ fontSize: "0.85rem", color: "rgba(0,0,0,0.55)", margin: "0.35rem 0 0" }}>
            Prix : <strong>{formatEther(saleInfo.priceWeiPerToken)} ETH</strong> / token
          </p>
        )}
      </div>
    </div>
  );
}
