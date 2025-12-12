import React, { useEffect, useMemo, useState } from "react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { readContract } from "wagmi/actions";
import { config } from "../web3/wagmiConfig.js";

import { CONTRACTS } from "../config/contracts.js";

import IdentityJSON from "../abis/IdentityRegistry.json";
import KYCJSON from "../abis/KYCRequestRegistry.json";
import TokenFactoryJSON from "../abis/TokenFactory.json";
import HouseTokenJSON from "../abis/HouseSecurityToken.json";

const IdentityABI = IdentityJSON.abi;
const KYCABI = KYCJSON.abi;
const TokenFactoryABI = TokenFactoryJSON.abi;
const HouseTokenABI = HouseTokenJSON.abi;

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

function isValidAddress(addr) {
  return typeof addr === "string" && addr.startsWith("0x") && addr.length === 42;
}

function Card({ title, subtitle, children }) {
  return (
    <section
      className="card card--solid"
      style={{ padding: "1rem", borderRadius: 18 }}
    >
      {title && <h2 style={{ margin: 0 }}>{title}</h2>}
      {subtitle && (
        <p style={{ marginTop: "0.4rem", color: "rgba(15,18,23,0.62)" }}>
          {subtitle}
        </p>
      )}
      <div style={{ marginTop: "0.9rem" }}>{children}</div>
    </section>
  );
}

function Row({ children }) {
  return <div style={{ display: "grid", gap: "0.6rem" }}>{children}</div>;
}

function Badge({ children, tone = "neutral" }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

function shortAddr(a) {
  if (!a) return "";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export default function Admin() {
  const { address, isConnected } = useAccount();
  const { writeContract, isPending } = useWriteContract();

  // --------- Admin gate ----------
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

  // =========================================================================
  // 1) KYC - Recherche manuelle
  // =========================================================================
  const [kycWallet, setKycWallet] = useState("");

  const { data: kycRequest } = useReadContract({
    address: CONTRACTS.kycRequestRegistry,
    abi: KYCABI,
    functionName: "requests",
    args: isValidAddress(kycWallet) ? [kycWallet] : undefined,
    query: { enabled: isValidAddress(kycWallet) },
  });

  const { data: isVerified } = useReadContract({
    address: CONTRACTS.identityRegistry,
    abi: IdentityABI,
    functionName: "isVerified",
    args: isValidAddress(kycWallet) ? [kycWallet] : undefined,
    query: { enabled: isValidAddress(kycWallet) },
  });

  let exists = false;
  let approved = false;
  let rejected = false;
  let kycHash = null;

  if (Array.isArray(kycRequest) && kycRequest.length >= 4) {
    kycHash = kycRequest[0];
    exists = kycRequest[1];
    approved = kycRequest[2];
    rejected = kycRequest[3];
  }

  // états -> boutons
  const canApprove = exists && !approved && !rejected;
  const canReject = exists && !rejected; // peut servir même si approved (selon ton contrat)
  const canRevokeInvest = Boolean(isVerified);

  async function approveAndWhitelist(wallet) {
    await writeContract({
      address: CONTRACTS.kycRequestRegistry,
      abi: KYCABI,
      functionName: "approveKYC",
      args: [wallet],
    });
    await writeContract({
      address: CONTRACTS.identityRegistry,
      abi: IdentityABI,
      functionName: "verifyInvestor",
      args: [wallet],
    });
  }

  async function rejectAndRevoke(wallet) {
    await writeContract({
      address: CONTRACTS.kycRequestRegistry,
      abi: KYCABI,
      functionName: "rejectKYC",
      args: [wallet],
    });
    await writeContract({
      address: CONTRACTS.identityRegistry,
      abi: IdentityABI,
      functionName: "revokeInvestor",
      args: [wallet],
    });
  }

  async function revokeWhitelist(wallet) {
    await writeContract({
      address: CONTRACTS.identityRegistry,
      abi: IdentityABI,
      functionName: "revokeInvestor",
      args: [wallet],
    });
  }

  async function handleApproveKYC(e) {
    e.preventDefault();
    if (!isValidAddress(kycWallet)) return alert("Adresse invalide.");
    if (!exists) return alert("Aucune demande KYC pour ce wallet.");

    try {
      await approveAndWhitelist(kycWallet);
      alert("KYC approuvé & wallet whiteliste.");
    } catch (err) {
      console.error(err);
      alert(err?.shortMessage || err?.message || "Erreur approbation KYC");
    }
  }

  async function handleRejectKYC(e) {
    e.preventDefault();
    if (!isValidAddress(kycWallet)) return alert("Adresse invalide.");
    if (!exists) return alert("Aucune demande KYC pour ce wallet.");

    try {
      await rejectAndRevoke(kycWallet);
      alert("KYC rejeté & whitelist révoquée.");
    } catch (err) {
      console.error(err);
      alert(err?.shortMessage || err?.message || "Erreur rejet KYC");
    }
  }

  async function handleRevokeInvestor(e) {
    e.preventDefault();
    if (!isValidAddress(kycWallet)) return alert("Adresse invalide.");

    try {
      await revokeWhitelist(kycWallet);
      alert("Droit d'investir révoqué.");
    } catch (err) {
      console.error(err);
      alert(err?.shortMessage || err?.message || "Erreur revokeInvestor");
    }
  }

  // =========================================================================
  // 1bis) KYC - Liste (localStorage + statut on-chain)
  // =========================================================================
  const [reloadFlag, setReloadFlag] = useState(0);

  const [kycForms] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("kycForms") || "{}");
    } catch {
      return {};
    }
  });

  const [kycList, setKycList] = useState([]);

  useEffect(() => {
    async function loadStatuses() {
      const entries = Object.values(kycForms || {});
      const result = [];

      for (const item of entries) {
        const wallet = item.wallet;
        if (!isValidAddress(wallet)) continue;

        try {
          const [req, verified] = await Promise.all([
            readContract(config, {
              address: CONTRACTS.kycRequestRegistry,
              abi: KYCABI,
              functionName: "requests",
              args: [wallet],
            }),
            readContract(config, {
              address: CONTRACTS.identityRegistry,
              abi: IdentityABI,
              functionName: "isVerified",
              args: [wallet],
            }),
          ]);

          let existsReq = false;
          let approvedReq = false;
          let rejectedReq = false;
          let reqHash = null;

          if (Array.isArray(req) && req.length >= 4) {
            reqHash = req[0];
            existsReq = req[1];
            approvedReq = req[2];
            rejectedReq = req[3];
          }

          result.push({
            ...item,
            exists: existsReq,
            approved: approvedReq,
            rejected: rejectedReq,
            isVerified: Boolean(verified),
            kycHash: reqHash,
          });
        } catch (err) {
          console.error("Erreur loadStatuses:", err);
          result.push({
            ...item,
            exists: false,
            approved: false,
            rejected: false,
            isVerified: false,
            kycHash: null,
          });
        }
      }

      setKycList(result);
    }

    loadStatuses();
  }, [kycForms, reloadFlag]);

  const pendingList = useMemo(
    () => kycList.filter((i) => i.exists && !i.approved && !i.rejected),
    [kycList]
  );
  const approvedList = useMemo(() => kycList.filter((i) => i.approved), [kycList]);
  const rejectedList = useMemo(() => kycList.filter((i) => i.rejected), [kycList]);

  // =========================================================================
  // 2) BIENS
  // =========================================================================
  const [propertyMeta, setPropertyMeta] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("propertyMeta") || "{}");
    } catch {
      return {};
    }
  });

  function savePropertyMeta(newMeta) {
    setPropertyMeta(newMeta);
    localStorage.setItem("propertyMeta", JSON.stringify(newMeta));
  }

  function getMeta(tokenAddr) {
    const key = tokenAddr.toLowerCase();
    return (
      propertyMeta[key] || {
        token: tokenAddr,
        published: false,
        price: "",
        spvName: "",
        spvRegistration: "",
        spvContractNumber: "",
        addressLine: "",
        city: "",
        country: "",
        rooms: "",
        sqm: "",
        yield: "",
        description: "",
        imageDataUrl: null,
        projectOwner: "",
      }
    );
  }

  function updatePropertyField(tokenAddr, field, value) {
    const key = tokenAddr.toLowerCase();
    const current = getMeta(tokenAddr);

    if (current.published && field !== "published") {
      alert("Dépublie ce bien pour modifier ses infos.");
      return;
    }

    const updated = { ...current, [field]: value };
    const next = { ...propertyMeta, [key]: updated };
    savePropertyMeta(next);
  }

  function setPublished(tokenAddr, published) {
    updatePropertyField(tokenAddr, "published", published);
  }

  const [newTokenForm, setNewTokenForm] = useState({
    name: "",
    symbol: "",
    maxSupply: "",
    projectOwner: "",
    price: "",
    addressLine: "",
    city: "",
    country: "",
    rooms: "",
    sqm: "",
    yield: "",
    description: "",
    spvName: "",
    spvRegistration: "",
    spvContractNumber: "",
  });

  const [imageDataUrl, setImageDataUrl] = useState("");

  function updateNewTokenField(e) {
    setNewTokenForm((p) => ({ ...p, [e.target.name]: e.target.value }));
  }

  function handleNewImageChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const res = reader.result;
      if (typeof res === "string") setImageDataUrl(res);
    };
    reader.readAsDataURL(file);
  }

  async function handleCreateToken(e) {
    e.preventDefault();

    const {
      name,
      symbol,
      maxSupply,
      projectOwner,
      price,
      addressLine,
      city,
      country,
      rooms,
      sqm,
      yield: yieldPct,
      description,
      spvName,
      spvRegistration,
      spvContractNumber,
    } = newTokenForm;

    if (!name || !symbol || !maxSupply || !isValidAddress(projectOwner)) {
      alert("Complète name, symbol, maxSupply et projectOwner (adresse valide).");
      return;
    }

    try {
      await writeContract({
        address: CONTRACTS.tokenFactory,
        abi: TokenFactoryABI,
        functionName: "createHouseToken",
        args: [name, symbol, BigInt(maxSupply), projectOwner],
      });

      const countAfter = await readContract(config, {
        address: CONTRACTS.tokenFactory,
        abi: TokenFactoryABI,
        functionName: "getHouseTokenCount",
      });

      const lastIndex = Number(countAfter) - 1;
      const tokenAddr = await readContract(config, {
        address: CONTRACTS.tokenFactory,
        abi: TokenFactoryABI,
        functionName: "allHouseTokens",
        args: [lastIndex],
      });

      const key = tokenAddr.toLowerCase();
      const metaCopy = { ...propertyMeta };

      metaCopy[key] = {
        token: tokenAddr,
        published: true,
        projectOwner,
        price,
        addressLine,
        city,
        country,
        rooms,
        sqm,
        yield: yieldPct,
        description,
        imageDataUrl: imageDataUrl || null,
        spvName,
        spvRegistration,
        spvContractNumber,
        name,
        symbol,
      };

      savePropertyMeta(metaCopy);

      alert("Token créé + infos bien enregistrées (publié).");
      setNewTokenForm({
        name: "",
        symbol: "",
        maxSupply: "",
        projectOwner: "",
        price: "",
        addressLine: "",
        city: "",
        country: "",
        rooms: "",
        sqm: "",
        yield: "",
        description: "",
        spvName: "",
        spvRegistration: "",
        spvContractNumber: "",
      });
      setImageDataUrl("");
      setReloadFlag((x) => x + 1);
    } catch (err) {
      console.error(err);
      alert(err?.shortMessage || err?.message || "Erreur createHouseToken");
    }
  }

  // tokens on-chain
  const [tokens, setTokens] = useState([]);
  const [loadingTokens, setLoadingTokens] = useState(false);

  useEffect(() => {
    async function loadTokens() {
      try {
        setLoadingTokens(true);

        const count = await readContract(config, {
          address: CONTRACTS.tokenFactory,
          abi: TokenFactoryABI,
          functionName: "getHouseTokenCount",
        });

        const n = Number(count);
        const list = [];

        for (let i = 0; i < n; i++) {
          const tokenAddr = await readContract(config, {
            address: CONTRACTS.tokenFactory,
            abi: TokenFactoryABI,
            functionName: "allHouseTokens",
            args: [i],
          });

          const [name, symbol, totalSupply, maxSupply, saleContract] =
            await Promise.all([
              readContract(config, { address: tokenAddr, abi: HouseTokenABI, functionName: "name" }),
              readContract(config, { address: tokenAddr, abi: HouseTokenABI, functionName: "symbol" }),
              readContract(config, { address: tokenAddr, abi: HouseTokenABI, functionName: "totalSupply" }),
              readContract(config, { address: tokenAddr, abi: HouseTokenABI, functionName: "maxSupply" }),
              readContract(config, { address: tokenAddr, abi: HouseTokenABI, functionName: "saleContract" }),
            ]);

          list.push({
            address: tokenAddr,
            name,
            symbol,
            totalSupply: totalSupply ?? 0n,
            maxSupply: maxSupply ?? 0n,
            saleContract,
          });
        }

        setTokens(list);
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingTokens(false);
      }
    }

    loadTokens();
  }, [reloadFlag]);

  // burn
  const [burnInputs, setBurnInputs] = useState({});
  function updateBurnInput(tokenAddr, field, value) {
    setBurnInputs((prev) => ({
      ...prev,
      [tokenAddr]: { ...(prev[tokenAddr] || {}), [field]: value },
    }));
  }

  async function handleBurnToken(tokenAddr) {
    const input = burnInputs[tokenAddr] || {};
    const from = input.from;
    const amountStr = input.amount;

    if (!isValidAddress(from)) return alert("Adresse 'from' invalide.");
    if (!amountStr || Number(amountStr) <= 0) return alert("Montant invalide.");

    try {
      await writeContract({
        address: tokenAddr,
        abi: HouseTokenABI,
        functionName: "burn",
        args: [from, BigInt(amountStr)],
      });
      alert("Tokens burnés.");
      setReloadFlag((x) => x + 1);
    } catch (err) {
      console.error(err);
      alert(err?.shortMessage || err?.message || "Erreur burn()");
    }
  }

  // set sale contract
  const [saleInputs, setSaleInputs] = useState({});
  const [editSaleMode, setEditSaleMode] = useState({});

  function updateSaleInput(tokenAddr, value) {
    setSaleInputs((prev) => ({ ...prev, [tokenAddr]: value }));
  }
  function toggleEditSale(tokenAddr) {
    setEditSaleMode((prev) => ({ ...prev, [tokenAddr]: !prev[tokenAddr] }));
  }

  async function handleSetSaleContract(tokenAddr) {
    const saleAddr = saleInputs[tokenAddr];
    if (!isValidAddress(saleAddr)) return alert("Adresse HouseEthSale invalide.");

    try {
      await writeContract({
        address: tokenAddr,
        abi: HouseTokenABI,
        functionName: "setSaleContract",
        args: [saleAddr],
      });

      alert("Contrat de vente lié au token.");
      setReloadFlag((x) => x + 1);
      setEditSaleMode((p) => ({ ...p, [tokenAddr]: false }));
    } catch (err) {
      console.error(err);
      alert(err?.shortMessage || err?.message || "Erreur setSaleContract");
    }
  }

  // =========================================================================
  // RENDER
  // =========================================================================
  if (!isConnected) {
    return (
      <div className="container">
        <Card
          title="Espace admin"
          subtitle="Connecte-toi avec le wallet admin (platformOwner) pour voir cet espace."
        />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="container">
        <Card title="Espace admin">
          <p>Tu n&apos;es pas autorisé à accéder à l&apos;administration.</p>
          <p>
            Wallet connecté : <code>{address}</code>
          </p>
          <p>
            Owner attendu : <code>{ownerAddress?.toString()}</code>
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="container" style={{ display: "grid", gap: "1.25rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
        <h1 style={{ margin: 0 }}>Admin</h1>
        <Badge tone="admin">Owner</Badge>
        <span style={{ color: "rgba(15,18,23,0.62)" }}>
          connecté : <code>{shortAddr(address)}</code>
        </span>
      </div>

      {/* ===================== SECTION KYC ===================== */}
      <Card
        title="1) Compliance & KYC"
        subtitle="Gère les demandes KYC (statut on-chain) et la whitelist (IdentityRegistry)."
      >
        <div style={{ display: "grid", gap: "1rem" }}>
          {/* Recherche */}
          <div className="card" style={{ padding: "0.9rem" }}>
            <h3 style={{ marginTop: 0 }}>Recherche par wallet</h3>
            <Row>
              <div>
                <label>Adresse investisseur</label>
                <input
                  style={{ width: "100%", marginTop: 6 }}
                  value={kycWallet}
                  onChange={(e) => setKycWallet(e.target.value)}
                  placeholder="0x..."
                />
              </div>

              {isValidAddress(kycWallet) && (
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <Badge tone={exists ? "ok" : "danger"}>Request: {exists ? "oui" : "non"}</Badge>
                  <Badge tone={approved ? "ok" : "neutral"}>Approved: {String(approved)}</Badge>
                  <Badge tone={rejected ? "danger" : "neutral"}>Rejected: {String(rejected)}</Badge>
                  <Badge tone={isVerified ? "ok" : "warn"}>
                    Whitelist: {isVerified ? "oui" : "non"}
                  </Badge>
                  {kycHash && kycHash !== "0x0000000000000000000000000000000000000000000000000000000000000000" && (
                    <Badge>Hash: {String(kycHash).slice(0, 10)}…</Badge>
                  )}
                </div>
              )}

              <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
                <button
                  className="btn"
                  onClick={handleApproveKYC}
                  disabled={isPending || !canApprove}
                  title={!canApprove ? "KYC non en attente ou déjà traité" : ""}
                  type="button"
                >
                  ✅ Approuver + Whitelist
                </button>

                <button
                  className="btn btn--ghost"
                  onClick={handleRejectKYC}
                  disabled={isPending || !canReject}
                  title={!canReject ? "KYC inexistant ou déjà rejeté" : ""}
                  type="button"
                >
                  ❌ Rejeter + Révoquer whitelist
                </button>

                <button
                  className="btn btn--ghost"
                  onClick={handleRevokeInvestor}
                  disabled={isPending || !canRevokeInvest}
                  title={!canRevokeInvest ? "Wallet pas whiteliste actuellement" : ""}
                  type="button"
                >
                  🧊 Révoquer seulement le droit d&apos;investir
                </button>

                <button
                  className="btn btn--ghost"
                  type="button"
                  onClick={() => setReloadFlag((x) => x + 1)}
                >
                  ↻ Rafraîchir
                </button>
              </div>
            </Row>
          </div>

          {/* Listes */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: "1rem",
            }}
          >
            {/* Pending */}
            <div className="card" style={{ padding: "0.9rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h3 style={{ margin: 0 }}>En attente</h3>
                <Badge tone="warn">{pendingList.length}</Badge>
              </div>

              {pendingList.length === 0 && <p style={{ color: "rgba(15,18,23,0.62)" }}>Aucune demande.</p>}

              {pendingList.map((item) => (
                <div
                  key={item.wallet}
                  style={{
                    border: "1px solid rgba(0,0,0,0.08)",
                    borderRadius: 14,
                    padding: "0.7rem",
                    marginTop: "0.7rem",
                    background: "rgba(255,255,255,0.6)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{item.form?.lastname} {item.form?.firstname}</div>
                      <div style={{ color: "rgba(15,18,23,0.62)", fontSize: "0.9rem" }}>
                        <code>{shortAddr(item.wallet)}</code>
                      </div>
                    </div>
                    <Badge tone="warn">Pending</Badge>
                  </div>

                  <div style={{ marginTop: 8, fontSize: "0.92rem" }}>
                    <div><strong>Adresse :</strong> {item.form?.street}, {item.form?.city}, {item.form?.country}</div>
                    <div><strong>Nationalité :</strong> {item.form?.nationality || "—"}</div>
                    <div><strong>Résidence fiscale :</strong> {item.form?.taxCountry || "—"}</div>
                  </div>

                  {item.kycHash && (
                    <div style={{ marginTop: 8, fontSize: "0.9rem" }}>
                      <strong>Hash :</strong> <code>{String(item.kycHash)}</code>
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    <button
                      className="btn"
                      type="button"
                      disabled={isPending}
                      onClick={async () => {
                        try {
                          if (item.form?.taxCountry && item.form.taxCountry !== "FR") {
                            alert("Compliance: résidence fiscale ≠ FR. Refuse ou ne l'approuve pas.");
                            return;
                          }
                          await approveAndWhitelist(item.wallet);
                          alert("KYC approuvé & wallet whiteliste.");
                          setReloadFlag((x) => x + 1);
                        } catch (err) {
                          console.error(err);
                          alert(err?.shortMessage || err?.message || "Erreur approbation");
                        }
                      }}
                    >
                      ✅ Approuver
                    </button>

                    <button
                      className="btn btn--ghost"
                      type="button"
                      disabled={isPending}
                      onClick={async () => {
                        try {
                          await rejectAndRevoke(item.wallet);
                          alert("KYC rejeté & whitelist révoquée.");
                          setReloadFlag((x) => x + 1);
                        } catch (err) {
                          console.error(err);
                          alert(err?.shortMessage || err?.message || "Erreur rejet");
                        }
                      }}
                    >
                      ❌ Refuser
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Approved */}
            <div className="card" style={{ padding: "0.9rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h3 style={{ margin: 0 }}>Approuvés</h3>
                <Badge tone="ok">{approvedList.length}</Badge>
              </div>

              {approvedList.length === 0 && <p style={{ color: "rgba(15,18,23,0.62)" }}>Aucun.</p>}

              {approvedList.map((item) => (
                <div
                  key={item.wallet}
                  style={{
                    border: "1px solid rgba(0,0,0,0.08)",
                    borderRadius: 14,
                    padding: "0.7rem",
                    marginTop: "0.7rem",
                    background: "rgba(255,255,255,0.6)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{item.form?.lastname} {item.form?.firstname}</div>
                      <div style={{ color: "rgba(15,18,23,0.62)", fontSize: "0.9rem" }}>
                        <code>{shortAddr(item.wallet)}</code>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      <Badge tone="ok">Approved</Badge>
                      <Badge tone={item.isVerified ? "ok" : "warn"}>
                        Whitelist {item.isVerified ? "ON" : "OFF"}
                      </Badge>
                    </div>
                  </div>

                  <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      className="btn btn--ghost"
                      type="button"
                      disabled={isPending || !item.isVerified}
                      title={!item.isVerified ? "Déjà révoqué" : ""}
                      onClick={async () => {
                        try {
                          await revokeWhitelist(item.wallet);
                          alert("Whitelist révoquée.");
                          setReloadFlag((x) => x + 1);
                        } catch (err) {
                          console.error(err);
                          alert(err?.shortMessage || err?.message || "Erreur revoke");
                        }
                      }}
                    >
                      🧊 Révoquer droit d&apos;investir
                    </button>

                    <button
                      className="btn btn--ghost"
                      type="button"
                      disabled={isPending}
                      onClick={async () => {
                        try {
                          await rejectAndRevoke(item.wallet);
                          alert("KYC rejeté & whitelist révoquée.");
                          setReloadFlag((x) => x + 1);
                        } catch (err) {
                          console.error(err);
                          alert(err?.shortMessage || err?.message || "Erreur rejet");
                        }
                      }}
                      title="Selon ton contrat, cette action peut être interdite après approbation."
                    >
                      ❌ Rejeter (si autorisé)
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Rejected */}
            <div className="card" style={{ padding: "0.9rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <h3 style={{ margin: 0 }}>Rejetés</h3>
                <Badge tone="danger">{rejectedList.length}</Badge>
              </div>

              {rejectedList.length === 0 && <p style={{ color: "rgba(15,18,23,0.62)" }}>Aucun.</p>}

              {rejectedList.map((item) => (
                <div
                  key={item.wallet}
                  style={{
                    border: "1px solid rgba(0,0,0,0.08)",
                    borderRadius: 14,
                    padding: "0.7rem",
                    marginTop: "0.7rem",
                    background: "rgba(255,255,255,0.6)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{item.form?.lastname} {item.form?.firstname}</div>
                      <div style={{ color: "rgba(15,18,23,0.62)", fontSize: "0.9rem" }}>
                        <code>{shortAddr(item.wallet)}</code>
                      </div>
                    </div>
                    <Badge tone="danger">Rejected</Badge>
                  </div>

                  <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      className="btn"
                      type="button"
                      disabled={isPending}
                      onClick={async () => {
                        try {
                          if (item.form?.taxCountry && item.form.taxCountry !== "FR") {
                            alert("Compliance: résidence fiscale ≠ FR. Corrige son formulaire avant approbation.");
                            return;
                          }
                          await approveAndWhitelist(item.wallet);
                          alert("KYC ré-approuvé & wallet whiteliste.");
                          setReloadFlag((x) => x + 1);
                        } catch (err) {
                          console.error(err);
                          alert(err?.shortMessage || err?.message || "Erreur ré-approbation");
                        }
                      }}
                    >
                      ✅ Ré-approuver
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* ===================== SECTION BIENS ===================== */}
      <Card
        title="2) Biens & Tokens"
        subtitle="Créer un bien, gérer les infos front, lier le HouseEthSale, et suivre la tokenisation."
      >
        {/* Création */}
        <div className="card" style={{ padding: "0.9rem" }}>
          <h3 style={{ marginTop: 0 }}>Créer un nouveau bien</h3>

          <form
            onSubmit={handleCreateToken}
            style={{
              display: "grid",
              gap: "0.7rem",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              alignItems: "start",
            }}
          >
            <div style={{ gridColumn: "1 / -1" }}>
              <Badge>On-chain</Badge>
            </div>

            <div>
              <label>Nom du bien</label>
              <input name="name" value={newTokenForm.name} onChange={updateNewTokenField} />
            </div>

            <div>
              <label>Symbole (ticker)</label>
              <input name="symbol" value={newTokenForm.symbol} onChange={updateNewTokenField} />
            </div>

            <div>
              <label>Max supply</label>
              <input
                name="maxSupply"
                type="number"
                value={newTokenForm.maxSupply}
                onChange={updateNewTokenField}
              />
            </div>

            <div>
              <label>ProjectOwner (wallet SPV)</label>
              <input
                name="projectOwner"
                value={newTokenForm.projectOwner}
                onChange={updateNewTokenField}
                placeholder="0x..."
              />
            </div>

            <div style={{ gridColumn: "1 / -1", marginTop: 6 }}>
              <Badge>SPV (front)</Badge>
            </div>

            <div>
              <label>Nom légal SPV</label>
              <input name="spvName" value={newTokenForm.spvName} onChange={updateNewTokenField} />
            </div>

            <div>
              <label>Immatriculation</label>
              <input
                name="spvRegistration"
                value={newTokenForm.spvRegistration}
                onChange={updateNewTokenField}
                placeholder="RCS ..."
              />
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <label>Numéro de contrat / dossier</label>
              <input
                name="spvContractNumber"
                value={newTokenForm.spvContractNumber}
                onChange={updateNewTokenField}
                placeholder="ABC-2025-001"
              />
            </div>

            <div style={{ gridColumn: "1 / -1", marginTop: 6 }}>
              <Badge>Bien (front)</Badge>
            </div>

            <div>
              <label>Prix du bien (€)</label>
              <input name="price" type="number" value={newTokenForm.price} onChange={updateNewTokenField} />
            </div>

            <div>
              <label>Adresse du bien</label>
              <input
                name="addressLine"
                value={newTokenForm.addressLine}
                onChange={updateNewTokenField}
                placeholder="..."
              />
            </div>

            <div>
              <label>Ville</label>
              <input name="city" value={newTokenForm.city} onChange={updateNewTokenField} />
            </div>

            <div>
              <label>Pays</label>
              <input name="country" value={newTokenForm.country} onChange={updateNewTokenField} />
            </div>

            <div>
              <label>Image (upload)</label>
              <input type="file" accept="image/*" onChange={handleNewImageChange} />
              {imageDataUrl && (
                <img
                  src={imageDataUrl}
                  alt="preview"
                  style={{ marginTop: 8, width: 180, borderRadius: 14, border: "1px solid rgba(0,0,0,0.08)" }}
                />
              )}
            </div>

            <div style={{ gridColumn: "1 / -1" }}>
              <label>Description</label>
              <textarea
                name="description"
                rows={3}
                value={newTokenForm.description}
                onChange={updateNewTokenField}
              />
            </div>

            <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10 }}>
              <button className="btn" type="submit" disabled={isPending}>
                {isPending ? "Transaction..." : "Créer le token + publier"}
              </button>
              <button
                className="btn btn--ghost"
                type="button"
                onClick={() => setReloadFlag((x) => x + 1)}
              >
                ↻ Rafraîchir la liste
              </button>
            </div>
          </form>
        </div>

        {/* Liste */}
        <div style={{ marginTop: "1rem" }}>
          <h3 style={{ margin: "0 0 0.6rem 0" }}>Tokens existants</h3>
          {loadingTokens && <p>Chargement…</p>}
          {!loadingTokens && tokens.length === 0 && <p>Aucun token.</p>}

          <div style={{ display: "grid", gap: "0.9rem" }}>
            {tokens.map((t) => {
              const ts = t.totalSupply ?? 0n;
              const ms = t.maxSupply ?? 0n;
              const progress = ms > 0n ? Number((ts * 100n) / ms) : 0;

              const meta = getMeta(t.address);
              const isLinked = t.saleContract && t.saleContract !== ZERO_ADDR;

              // conversion € -> % / token
              const maxSupplyNum = Number(ms);
              let pricePerTokenEUR = null;
              let percentPerToken = null;
              if (meta.price && maxSupplyNum > 0) {
                const p = Number(meta.price);
                pricePerTokenEUR = p / maxSupplyNum;
                percentPerToken = 100 / maxSupplyNum;
              }

              const burn = burnInputs[t.address] || {};
              const isPublished = !!meta.published;
              const metaDisabled = isPublished;

              return (
                <div key={t.address} className="card" style={{ padding: "1rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: "1.15rem", fontWeight: 800 }}>
                        {t.name} <span style={{ color: "rgba(15,18,23,0.55)" }}>({t.symbol})</span>
                      </div>
                      <div style={{ color: "rgba(15,18,23,0.62)" }}>
                        <code>{t.address}</code>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <Badge tone={isPublished ? "ok" : "warn"}>{isPublished ? "Publié" : "Non publié"}</Badge>
                      <Badge tone={isLinked ? "ok" : "warn"}>{isLinked ? "Sale liée" : "Sale manquante"}</Badge>
                    </div>
                  </div>

                  <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      <div>
                        <strong>Supply :</strong> {String(ts)} / {String(ms)} ({progress}%)
                      </div>
                      {pricePerTokenEUR !== null && percentPerToken !== null && (
                        <div>
                          <strong>1 token</strong> = {pricePerTokenEUR.toFixed(2)} € ≈{" "}
                          {percentPerToken.toFixed(4)} % du bien
                        </div>
                      )}
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {!isPublished ? (
                        <button className="btn" type="button" onClick={() => setPublished(t.address, true)}>
                          Publier
                        </button>
                      ) : (
                        <button className="btn btn--ghost" type="button" onClick={() => setPublished(t.address, false)}>
                          Dépublier (pour modifier)
                        </button>
                      )}
                    </div>

                    {/* Sale link */}
                    <div style={{ marginTop: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                        <h4 style={{ margin: 0 }}>Contrat HouseEthSale</h4>
                        <div style={{ color: "rgba(15,18,23,0.62)" }}>
                          Actuel : <code>{isLinked ? t.saleContract : "Aucun"}</code>
                        </div>
                      </div>

                      {!isLinked && (
                        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                          <label>Adresse HouseEthSale</label>
                          <input
                            value={saleInputs[t.address] || ""}
                            onChange={(e) => updateSaleInput(t.address, e.target.value)}
                            placeholder="0x..."
                          />
                          <button className="btn" type="button" onClick={() => handleSetSaleContract(t.address)}>
                            Lier au token
                          </button>
                        </div>
                      )}

                      {isLinked && (
                        <div style={{ marginTop: 10 }}>
                          <button className="btn btn--ghost" type="button" onClick={() => toggleEditSale(t.address)}>
                            {editSaleMode[t.address] ? "Annuler" : "Modifier l'adresse"}
                          </button>

                          {editSaleMode[t.address] && (
                            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                              <label>Nouvelle adresse HouseEthSale</label>
                              <input
                                value={saleInputs[t.address] || ""}
                                onChange={(e) => updateSaleInput(t.address, e.target.value)}
                                placeholder="0x..."
                              />
                              <button className="btn" type="button" onClick={() => handleSetSaleContract(t.address)}>
                                Enregistrer
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Burn */}
                    <div style={{ marginTop: 10 }}>
                      <h4 style={{ margin: "0 0 0.5rem 0" }}>Burn</h4>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <input
                          placeholder="Adresse from"
                          value={burn.from || ""}
                          onChange={(e) => updateBurnInput(t.address, "from", e.target.value)}
                        />
                        <input
                          placeholder="Quantité"
                          type="number"
                          value={burn.amount || ""}
                          onChange={(e) => updateBurnInput(t.address, "amount", e.target.value)}
                        />
                      </div>
                      <button className="btn btn--ghost" type="button" style={{ marginTop: 8 }} onClick={() => handleBurnToken(t.address)}>
                        🔥 Burn tokens
                      </button>
                    </div>

                    {/* Meta editing notice */}
                    {metaDisabled && (
                      <p style={{ color: "rgba(15,18,23,0.62)", marginTop: 6 }}>
                        ℹ️ Bien publié : dépublie pour modifier les infos front (SPV, prix, description…).
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>
    </div>
  );
}
