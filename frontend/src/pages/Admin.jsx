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

function isValidAddress(addr) {
  return typeof addr === "string" && addr.startsWith("0x") && addr.length === 42;
}

function shortAddr(a) {
  if (!a) return "";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export default function Admin() {
  const { address, isConnected } = useAccount();
  const { writeContract, isPending } = useWriteContract();

  // ---- Vérifier si admin (owner de IdentityRegistry) ----
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
  // HELPERS ACTIONS
  // =========================================================================
  async function approveKyc(wallet) {
    await writeContract({
      address: CONTRACTS.kycRequestRegistry,
      abi: KYCABI,
      functionName: "approveKYC",
      args: [wallet],
    });
  }

  async function rejectKyc(wallet) {
    await writeContract({
      address: CONTRACTS.kycRequestRegistry,
      abi: KYCABI,
      functionName: "rejectKYC",
      args: [wallet],
    });
  }

  async function verifyInvestor(wallet) {
    await writeContract({
      address: CONTRACTS.identityRegistry,
      abi: IdentityABI,
      functionName: "verifyInvestor",
      args: [wallet],
    });
  }

  async function revokeInvestor(wallet) {
    await writeContract({
      address: CONTRACTS.identityRegistry,
      abi: IdentityABI,
      functionName: "revokeInvestor",
      args: [wallet],
    });
  }

  // =========================================================================
  // 1) KYC (recherche manuelle)
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

  const kycManual = useMemo(() => {
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

    return {
      exists,
      approved,
      rejected,
      kycHash,
      isVerified: Boolean(isVerified),
    };
  }, [kycRequest, isVerified]);

  const canApproveManual = kycManual.exists && !kycManual.approved && !kycManual.rejected;
  const canRejectManual = kycManual.exists && !kycManual.rejected;
  const canRevokeManual = kycManual.isVerified; // freeze
  const canReWhitelistManual = kycManual.approved && !kycManual.isVerified; // approved but frozen

  // =========================================================================
  // 1 bis) LISTE KYC (localStorage + statut on-chain)
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
          });
        }
      }

      setKycList(result);
    }

    loadStatuses();
  }, [kycForms, reloadFlag]);

  const pendingList = kycList.filter((i) => i.exists && !i.approved && !i.rejected);
  const approvedWhitelistedList = kycList.filter((i) => i.approved && i.isVerified);
  const approvedFrozenList = kycList.filter((i) => i.approved && !i.isVerified);
  const rejectedList = kycList.filter((i) => i.rejected);

  // =========================================================================
  // 2) BIENS (meta front + tokens on-chain)
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
        addressLine: "",
        city: "",
        country: "",
        price: "",
        rooms: "",
        sqm: "",
        yield: "",
        description: "",
        imageDataUrl: null,
        published: false,
        projectOwner: "",
        spvName: "",
        spvRegistration: "",
        spvContractNumber: "",
      }
    );
  }

  function updatePropertyField(tokenAddr, field, value) {
    const key = tokenAddr.toLowerCase();
    const current = getMeta(tokenAddr);

    // ✅ IMPORTANT : on ne bloque plus l’édition (tu avais ce blocage)
    // Tu pourras re-bloquer uniquement si tu veux.
    const updated = { ...current, [field]: value };
    const next = { ...propertyMeta, [key]: updated };
    savePropertyMeta(next);
  }

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
        console.error("Erreur loadTokens:", err);
      } finally {
        setLoadingTokens(false);
      }
    }

    loadTokens();
  }, [reloadFlag]);

  const [saleInputs, setSaleInputs] = useState({}); // tokenAddr -> saleAddr
  const [editSaleMode, setEditSaleMode] = useState({}); // tokenAddr -> bool

  function toggleEditSale(tokenAddr) {
    setEditSaleMode((prev) => ({ ...prev, [tokenAddr]: !prev[tokenAddr] }));
  }

  function updateSaleInput(tokenAddr, value) {
    setSaleInputs((prev) => ({ ...prev, [tokenAddr]: value }));
  }

  async function handleSetSaleContract(tokenAddr) {
    const saleAddr = saleInputs[tokenAddr];
    if (!isValidAddress(saleAddr)) {
      alert("Adresse HouseEthSale invalide.");
      return;
    }

    try {
      await writeContract({
        address: tokenAddr,
        abi: HouseTokenABI,
        functionName: "setSaleContract",
        args: [saleAddr],
      });

      alert("Contrat de vente lié au token.");
      setReloadFlag((x) => x + 1);
      setEditSaleMode((prev) => ({ ...prev, [tokenAddr]: false }));
    } catch (err) {
      console.error(err);
      alert(err?.shortMessage || err?.message || "Erreur setSaleContract");
    }
  }

  // =========================================================================
  // RENDER GUARDS
  // =========================================================================
  if (!isConnected) {
    return (
      <div className="container">
        <h1>Admin</h1>
        <p>Connecte-toi avec le wallet admin (platformOwner) pour accéder à l’espace.</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="container">
        <h1>Admin</h1>
        <p>Tu n&apos;es pas autorisé à accéder à l&apos;administration.</p>
        <p>Wallet connecté : <code>{address}</code></p>
        <p>Owner attendu : <code>{ownerAddress?.toString()}</code></p>
      </div>
    );
  }

  // =========================================================================
  // UI
  // =========================================================================
  return (
    <div className="container" style={{ display: "grid", gap: 24 }}>
      <div className="pagehead">
        <h1 style={{ margin: 0 }}>Back-office</h1>
        <p className="muted" style={{ margin: 0 }}>Connecté en admin : <code>{shortAddr(address)}</code></p>
      </div>

      {/* ========================== SECTION KYC ========================== */}
      <section className="section">
        <div className="section__head">
          <h2 style={{ margin: 0 }}>KYC & Whitelist</h2>
          <p className="muted" style={{ margin: 0 }}>
            Approver = valide la demande KYC · Whitelist = autorise l’achat · Révoquer = gel
          </p>
        </div>

        <div className="grid2">
          {/* --- Recherche wallet --- */}
          <div className="card">
            <div className="card__body">
              <h3 style={{ marginTop: 0 }}>Recherche par wallet</h3>

              <label className="label">Adresse investisseur</label>
              <input
                className="input"
                value={kycWallet}
                onChange={(e) => setKycWallet(e.target.value)}
                placeholder="0x..."
              />

              {isValidAddress(kycWallet) && (
                <div style={{ marginTop: 12 }} className="muted">
                  <div>exists: {String(kycManual.exists)}</div>
                  <div>approved: {String(kycManual.approved)}</div>
                  <div>rejected: {String(kycManual.rejected)}</div>
                  <div>isVerified: {String(kycManual.isVerified)}</div>
                  {kycManual.kycHash && (
                    <div>kycHash: <code>{kycManual.kycHash}</code></div>
                  )}
                </div>
              )}

              <div className="flex" style={{ gap: 10, flexWrap: "wrap", marginTop: 14 }}>
                <button
                  className="btn"
                  disabled={isPending || !canApproveManual}
                  onClick={async () => {
                    try {
                      await approveKyc(kycWallet);
                      await verifyInvestor(kycWallet);
                      alert("KYC approuvé + whitelist ON.");
                      setReloadFlag((x) => x + 1);
                    } catch (e) {
                      alert(e?.shortMessage || e?.message || "Erreur approve");
                    }
                  }}
                >
                  ✅ Approver + Whitelist
                </button>

                <button
                  className="btn btn--ghost"
                  disabled={isPending || !canRevokeManual}
                  onClick={async () => {
                    try {
                      await revokeInvestor(kycWallet);
                      alert("Whitelist révoquée (gel).");
                      setReloadFlag((x) => x + 1);
                    } catch (e) {
                      alert(e?.shortMessage || e?.message || "Erreur revoke");
                    }
                  }}
                >
                  🧊 Révoquer (geler)
                </button>

                <button
                  className="btn"
                  disabled={isPending || !canReWhitelistManual}
                  onClick={async () => {
                    try {
                      await verifyInvestor(kycWallet);
                      alert("Wallet re-whiteliste.");
                      setReloadFlag((x) => x + 1);
                    } catch (e) {
                      alert(e?.shortMessage || e?.message || "Erreur re-whitelist");
                    }
                  }}
                >
                  ✅ Re-whitelister
                </button>

                <button
                  className="btn btn--ghost"
                  disabled={isPending || !canRejectManual}
                  onClick={async () => {
                    try {
                      await rejectKyc(kycWallet);
                      await revokeInvestor(kycWallet);
                      alert("Rejeté + whitelist off.");
                      setReloadFlag((x) => x + 1);
                    } catch (e) {
                      alert(e?.shortMessage || e?.message || "Erreur reject");
                    }
                  }}
                >
                  ❌ Rejeter
                </button>
              </div>
            </div>
          </div>

          {/* --- Vue rapide compteurs --- */}
          <div className="card">
            <div className="card__body">
              <h3 style={{ marginTop: 0 }}>Vue d’ensemble</h3>
              <div className="stats">
                <div className="stat">
                  <div className="stat__label">En attente</div>
                  <div className="stat__value">{pendingList.length}</div>
                </div>
                <div className="stat">
                  <div className="stat__label">Approuvés</div>
                  <div className="stat__value">{approvedWhitelistedList.length}</div>
                </div>
                <div className="stat">
                  <div className="stat__label">Gelés</div>
                  <div className="stat__value">{approvedFrozenList.length}</div>
                </div>
                <div className="stat">
                  <div className="stat__label">Rejetés</div>
                  <div className="stat__value">{rejectedList.length}</div>
                </div>
              </div>

              <p className="muted" style={{ marginTop: 12 }}>
                Remarque: la liste provient de <code>localStorage(kycForms)</code> + recoupement on-chain.
              </p>
            </div>
          </div>
        </div>

        {/* --- Listes --- */}
        <div className="grid2" style={{ marginTop: 16 }}>
          <KycListCard
            title="En attente"
            tone="warn"
            items={pendingList}
            isPending={isPending}
            onApprove={async (wallet, form) => {
              // compliance FR soft: tu peux durcir ici
              if (form?.taxCountry && form.taxCountry !== "FR") {
                alert("Compliance: résidence fiscale ≠ FR.");
                return;
              }
              await approveKyc(wallet);
              await verifyInvestor(wallet);
            }}
            onReject={async (wallet) => {
              await rejectKyc(wallet);
              await revokeInvestor(wallet);
            }}
            canApprove={(it) => it.exists && !it.approved && !it.rejected}
            canReject={(it) => it.exists && !it.rejected}
            showFreeze={false}
            showReWhitelist={false}
          />

          <KycListCard
            title="Approuvés (whitelist ON)"
            tone="ok"
            items={approvedWhitelistedList}
            isPending={isPending}
            onFreeze={async (wallet) => {
              await revokeInvestor(wallet);
            }}
            onReject={async (wallet) => {
              await rejectKyc(wallet);
              await revokeInvestor(wallet);
            }}
            showApprove={false}
            showFreeze
            showReWhitelist={false}
          />

          <KycListCard
            title="Gelés (KYC ok, achat interdit)"
            tone="warn"
            items={approvedFrozenList}
            isPending={isPending}
            onReWhitelist={async (wallet) => {
              await verifyInvestor(wallet);
            }}
            onReject={async (wallet) => {
              await rejectKyc(wallet);
              await revokeInvestor(wallet);
            }}
            showApprove={false}
            showFreeze={false}
            showReWhitelist
          />

          <KycListCard
            title="Rejetés"
            tone="danger"
            items={rejectedList}
            isPending={isPending}
            onReApprove={async (wallet, form) => {
              if (form?.taxCountry && form.taxCountry !== "FR") {
                alert("Compliance: résidence fiscale ≠ FR.");
                return;
              }
              await approveKyc(wallet);
              await verifyInvestor(wallet);
            }}
            showReject={false}
            showFreeze={false}
            showApprove={false}
            showReWhitelist={false}
            showReApprove
          />
        </div>
      </section>

      {/* ========================== SECTION BIENS ========================== */}
      <section className="section">
        <div className="section__head">
          <h2 style={{ margin: 0 }}>Biens & Security tokens</h2>
          <p className="muted" style={{ margin: 0 }}>
            Ici tu modifies les infos du bien (front) & tu demande à ton dev de lier manuellement le contrat HouseEthSale au security token.
          </p>
        </div>

        <div className="card">
          <div className="card__body">
            <h3 style={{ marginTop: 0 }}>Tokens existants</h3>
            {loadingTokens && <p className="muted">Chargement…</p>}
            {!loadingTokens && tokens.length === 0 && <p className="muted">Aucun token.</p>}

            {!loadingTokens &&
              tokens.map((t) => {
                const meta = getMeta(t.address);
                const ts = t.totalSupply ?? 0n;
                const ms = t.maxSupply ?? 0n;
                const maxSupplyNum = Number(ms || 0n);

                const progress = ms > 0n ? Number((ts * 100n) / ms) : 0;

                const isLinked =
                  t.saleContract &&
                  t.saleContract !== "0x0000000000000000000000000000000000000000";

                let adminPricePerTokenEUR = null;
                let adminPercentPerToken = null;
                if (meta.price && maxSupplyNum > 0) {
                  const price = Number(meta.price);
                  adminPricePerTokenEUR = price / maxSupplyNum;
                  adminPercentPerToken = 100 / maxSupplyNum;
                }

                return (
                  <div key={t.address} className="item" style={{ marginTop: 14 }}>
                    <div className="flex between">
                      <div>
                        <strong>{t.name}</strong> <span className="muted">(Security token • {t.symbol})</span>
                        <div className="muted">
                          Token: <code>{shortAddr(t.address)}</code>
                        </div>
                      </div>

                      <div className="flex" style={{ gap: 8 }}>
                        {isLinked ? <span className="badge badge--ok">Sale linked</span> : <span className="badge badge--warn">No sale</span>}
                      </div>
                    </div>

                    <div style={{ marginTop: 10 }}>
                      <div className="muted" style={{ fontSize: 13 }}>
                        Supply: {String(ts)} / {String(ms)} • {progress}%
                      </div>
                      <div className="progress"><div className="progress__bar" style={{ width: `${progress}%` }} /></div>

                      {adminPricePerTokenEUR !== null && adminPercentPerToken !== null && (
                        <p className="muted" style={{ marginTop: 8 }}>
                          1 token = <strong>{adminPricePerTokenEUR.toFixed(2)} €</strong> ≈{" "}
                          <strong>{adminPercentPerToken.toFixed(4)} %</strong> du bien
                        </p>
                      )}
                    </div>

                    {/* Infos BIEN (editable) */}
                    <div className="grid2" style={{ marginTop: 12 }}>
                      <div>
                        <label className="label">Adresse</label>
                        <input className="input" value={meta.addressLine || ""} onChange={(e) => updatePropertyField(t.address, "addressLine", e.target.value)} />
                      </div>
                      <div>
                        <label className="label">Ville</label>
                        <input className="input" value={meta.city || ""} onChange={(e) => updatePropertyField(t.address, "city", e.target.value)} />
                      </div>
                      <div>
                        <label className="label">Pays</label>
                        <input className="input" value={meta.country || ""} onChange={(e) => updatePropertyField(t.address, "country", e.target.value)} />
                      </div>
                      <div>
                        <label className="label">Prix du bien (€)</label>
                        <input className="input" type="number" value={meta.price || ""} onChange={(e) => updatePropertyField(t.address, "price", e.target.value)} />
                      </div>
                      <div>
                        <label className="label">m²</label>
                        <input className="input" type="number" value={meta.sqm || ""} onChange={(e) => updatePropertyField(t.address, "sqm", e.target.value)} />
                      </div>
                      <div>
                        <label className="label">Pièces</label>
                        <input className="input" type="number" value={meta.rooms || ""} onChange={(e) => updatePropertyField(t.address, "rooms", e.target.value)} />
                      </div>
                    </div>

                    {/* Infos SPV */}
                    <div className="grid2" style={{ marginTop: 12 }}>
                      <div>
                        <label className="label">SPV (nom légal)</label>
                        <input className="input" value={meta.spvName || ""} onChange={(e) => updatePropertyField(t.address, "spvName", e.target.value)} />
                      </div>
                      <div>
                        <label className="label">Immatriculation</label>
                        <input className="input" value={meta.spvRegistration || ""} onChange={(e) => updatePropertyField(t.address, "spvRegistration", e.target.value)} />
                      </div>
                      <div>
                        <label className="label">Numéro de contrat</label>
                        <input className="input" value={meta.spvContractNumber || ""} onChange={(e) => updatePropertyField(t.address, "spvContractNumber", e.target.value)} />
                      </div>
                      <div>
                        <label className="label">Rendement cible (%)</label>
                        <input className="input" type="number" step="0.1" value={meta.yield || ""} onChange={(e) => updatePropertyField(t.address, "yield", e.target.value)} />
                      </div>
                    </div>

                    <div style={{ marginTop: 12 }}>
                      <label className="label">Description</label>
                      <textarea className="textarea" rows={3} value={meta.description || ""} onChange={(e) => updatePropertyField(t.address, "description", e.target.value)} />
                    </div>

                    {/* Liaison Sale */}
                    <div style={{ marginTop: 14 }} className="card card--soft">
                      <div className="card__body">
                        <div className="flex between">
                          <strong>Contrat de vente (HouseEthSale)</strong>
                          <code>{isLinked ? shortAddr(t.saleContract) : "Aucun"}</code>
                        </div>

                        {!isLinked && (
                          <div style={{ marginTop: 10 }}>
                            <label className="label">Adresse HouseEthSale</label>
                            <input
                              className="input"
                              placeholder="0x..."
                              value={saleInputs[t.address] || ""}
                              onChange={(e) => updateSaleInput(t.address, e.target.value)}
                            />
                            <button className="btn" style={{ marginTop: 10 }} disabled={isPending} onClick={() => handleSetSaleContract(t.address)}>
                              💾 Lier ce contrat de vente
                            </button>
                          </div>
                        )}

                        {isLinked && (
                          <div style={{ marginTop: 10 }}>
                            {!editSaleMode[t.address] ? (
                              <button className="btn btn--ghost" type="button" onClick={() => toggleEditSale(t.address)}>
                                ✏️ Modifier l’adresse HouseEthSale
                              </button>
                            ) : (
                              <>
                                <label className="label">Nouvelle adresse HouseEthSale</label>
                                <input
                                  className="input"
                                  placeholder="0x..."
                                  value={saleInputs[t.address] || ""}
                                  onChange={(e) => updateSaleInput(t.address, e.target.value)}
                                />
                                <div className="flex" style={{ gap: 10, marginTop: 10 }}>
                                  <button className="btn" disabled={isPending} onClick={() => handleSetSaleContract(t.address)}>
                                    💾 Enregistrer
                                  </button>
                                  <button className="btn btn--ghost" type="button" onClick={() => toggleEditSale(t.address)}>
                                    Annuler
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </section>
    </div>
  );
}

/* ============================ SUB COMPONENTS ============================ */

function KycListCard({
  title,
  tone,
  items,
  isPending,
  onApprove,
  onReject,
  onFreeze,
  onReWhitelist,
  onReApprove,
  canApprove,
  canReject,
  showApprove = true,
  showReject = true,
  showFreeze = false,
  showReWhitelist = false,
  showReApprove = false,
}) {
  return (
    <div className="card">
      <div className="card__body">
        <div className="flex between">
          <h3 style={{ margin: 0 }}>{title}</h3>
          <span className={`badge badge--${tone}`}>{items.length}</span>
        </div>

        {items.length === 0 && <p className="muted" style={{ marginTop: 10 }}>Aucun.</p>}

        {items.map((item) => (
          <div key={item.wallet} className="item" style={{ marginTop: 12 }}>
            <div className="flex between">
              <div>
                <strong>{item.form?.lastname} {item.form?.firstname}</strong>
                <div className="muted"><code>{shortAddr(item.wallet)}</code></div>
              </div>
              <span className={`badge badge--${tone}`}>
                {item.rejected ? "Rejected" : item.approved ? (item.isVerified ? "Approved" : "Frozen") : "Pending"}
              </span>
            </div>

            <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
              {item.form?.taxCountry && <>Fiscal: <strong>{item.form.taxCountry}</strong> · </>}
              {item.form?.nationality && <>Nat: <strong>{item.form.nationality}</strong></>}
            </div>

            {item.kycHash && (
              <div className="muted" style={{ marginTop: 6 }}>
                Hash: <code>{item.kycHash}</code>
              </div>
            )}

            <div className="flex" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              {showApprove && (
                <button
                  className="btn"
                  type="button"
                  disabled={isPending || (canApprove ? !canApprove(item) : false)}
                  onClick={async () => {
                    try {
                      await onApprove?.(item.wallet, item.form);
                    } catch (e) {
                      alert(e?.shortMessage || e?.message || "Erreur approve");
                    }
                  }}
                >
                  ✅ Approuver
                </button>
              )}

              {showReApprove && (
                <button
                  className="btn"
                  type="button"
                  disabled={isPending}
                  onClick={async () => {
                    try {
                      await onReApprove?.(item.wallet, item.form);
                    } catch (e) {
                      alert(e?.shortMessage || e?.message || "Erreur re-approve");
                    }
                  }}
                >
                  ✅ Ré-approuver
                </button>
              )}

              {showReWhitelist && (
                <button
                  className="btn"
                  type="button"
                  disabled={isPending}
                  onClick={async () => {
                    try {
                      await onReWhitelist?.(item.wallet);
                    } catch (e) {
                      alert(e?.shortMessage || e?.message || "Erreur re-whitelist");
                    }
                  }}
                >
                  ✅ Re-whitelister
                </button>
              )}

              {showFreeze && (
                <button
                  className="btn btn--ghost"
                  type="button"
                  disabled={isPending}
                  onClick={async () => {
                    try {
                      await onFreeze?.(item.wallet);
                    } catch (e) {
                      alert(e?.shortMessage || e?.message || "Erreur freeze");
                    }
                  }}
                >
                  🧊 Révoquer (geler)
                </button>
              )}

              {showReject && (
                <button
                  className="btn btn--ghost"
                  type="button"
                  disabled={isPending || (canReject ? !canReject(item) : false)}
                  onClick={async () => {
                    try {
                      await onReject?.(item.wallet);
                    } catch (e) {
                      alert(e?.shortMessage || e?.message || "Erreur reject");
                    }
                  }}
                >
                  ❌ Rejeter
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
