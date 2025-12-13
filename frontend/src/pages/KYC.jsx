import React, { useEffect, useMemo, useState } from "react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { keccak256, toBytes } from "viem";

import { config } from "../web3/wagmiConfig.js";
import { CONTRACTS } from "../config/contracts.js";

import KYCJSON from "../abis/KYCRequestRegistry.json";
import IdentityJSON from "../abis/IdentityRegistry.json";

const KYCABI = KYCJSON.abi;
const IdentityABI = IdentityJSON.abi;

const ZERO = "0x0000000000000000000000000000000000000000";

const COUNTRIES = [
  "France",
  "Guadeloupe",
  "Martinique",
  "Guyane",
  "Réunion",
  "Belgique",
  "Suisse",
  "Luxembourg",
  "Espagne",
  "Portugal",
  "Italie",
  "Allemagne",
  "Royaume-Uni",
  "États-Unis",
  "Canada",
];

function isValidAddress(a) {
  return typeof a === "string" && a.startsWith("0x") && a.length === 42;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function loadKycForms() {
  try {
    return JSON.parse(localStorage.getItem("kycForms") || "{}");
  } catch {
    return {};
  }
}
function saveKycForms(obj) {
  localStorage.setItem("kycForms", JSON.stringify(obj));
}

function computeKycHash(payload) {
  const json = JSON.stringify(payload);
  return keccak256(toBytes(json));
}

function calcAge(birthDateStr) {
  if (!birthDateStr) return null;
  const birth = new Date(birthDateStr);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  const hadBirthdayThisYear =
    now >= new Date(now.getFullYear(), birth.getMonth(), birth.getDate());
  return now.getFullYear() - birth.getFullYear() - (hadBirthdayThisYear ? 0 : 1);
}

export default function KYC() {
  const { address, isConnected, chain } = useAccount();
  const { writeContract, isPending } = useWriteContract();

  const wallet = address || "";
  const [txHash, setTxHash] = useState(null);

  const { data: req } = useReadContract({
    address: CONTRACTS.kycRequestRegistry,
    abi: KYCABI,
    functionName: "requests",
    args: isConnected && isValidAddress(wallet) ? [wallet] : undefined,
    query: { enabled: isConnected && isValidAddress(wallet) },
  });

  const { data: isVerified } = useReadContract({
    address: CONTRACTS.identityRegistry,
    abi: IdentityABI,
    functionName: "isVerified",
    args: isConnected && isValidAddress(wallet) ? [wallet] : undefined,
    query: { enabled: isConnected && isValidAddress(wallet) },
  });

  const onchain = useMemo(() => {
    let kycHash = null;
    let exists = false;
    let approved = false;
    let rejected = false;

    if (Array.isArray(req) && req.length >= 4) {
      kycHash = req[0];
      exists = !!req[1];
      approved = !!req[2];
      rejected = !!req[3];
    }

    return {
      exists,
      approved,
      rejected,
      isVerified: Boolean(isVerified),
      kycHash,
    };
  }, [req, isVerified]);

  const savedLocal = useMemo(() => {
    if (!wallet) return null;
    const all = loadKycForms();
    const k1 = wallet.toLowerCase();
    return all[k1] || all[wallet] || null;
  }, [wallet]);

  const hasLocal = Boolean(savedLocal);

  const [editMode, setEditMode] = useState(false);

  const [form, setForm] = useState({
    firstname: "",
    lastname: "",
    birthDate: "",
    nationality: "France",
    taxCountry: "France",
    street: "",
    city: "",
    country: "France",
  });

  const [files, setFiles] = useState({
    idDoc: null,
    proofOfAddress: null,
    taxNotice: null,
  });

  useEffect(() => {
    if (!savedLocal) return;
    setForm((prev) => ({ ...prev, ...(savedLocal.form || {}) }));
    setFiles((prev) => ({ ...prev, ...(savedLocal.files || {}) }));
    setEditMode(false);
  }, [savedLocal]);

  function updateField(e) {
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));
  }

  async function handleFileChange(key, file) {
    if (!file) return;

    if (file.size > 2.5 * 1024 * 1024) {
      alert("Fichier trop lourd (> 2.5MB). Compresse (photo/pdf) puis réessaie.");
      return;
    }

    const dataUrl = await fileToDataUrl(file);
    setFiles((p) => ({
      ...p,
      [key]: { name: file.name, type: file.type, size: file.size, dataUrl },
    }));
  }

  function saveLocal(payload) {
    if (!wallet) return;
    const all = loadKycForms();
    all[wallet.toLowerCase()] = payload;
    saveKycForms(all);
  }

  function validateComplianceLocal() {
    const age = calcAge(form.birthDate);
    if (age === null) return "Date de naissance invalide.";
    if (age < 18) return "Tu dois avoir 18 ans minimum.";
    if (form.nationality !== "France") return "Nationalité non éligible (exigé : France).";
    if (form.taxCountry !== "France") return "Résidence fiscale non éligible (exigé : France).";
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setTxHash(null);

    if (!isConnected) return alert("Connecte ton wallet d’abord.");
    if (hasLocal && !editMode) return alert("Clique sur « Modifier mes infos » avant de re-soumettre.");

    const err = validateComplianceLocal();
    if (err) return alert(`Non autorisé : ${err}`);

    if (!files.idDoc || !files.proofOfAddress) {
      return alert("Merci d’uploader au minimum : pièce d’identité + justificatif de domicile.");
    }

    const fileMeta = {
      idDoc: files.idDoc ? { name: files.idDoc.name, type: files.idDoc.type, size: files.idDoc.size } : null,
      proofOfAddress: files.proofOfAddress
        ? { name: files.proofOfAddress.name, type: files.proofOfAddress.type, size: files.proofOfAddress.size }
        : null,
      taxNotice: files.taxNotice ? { name: files.taxNotice.name, type: files.taxNotice.type, size: files.taxNotice.size } : null,
    };

    const payload = { wallet, form, files, createdAt: Date.now() };
    const documentHash = computeKycHash({ wallet, form, fileMeta });

    try {
      saveLocal(payload);

      if (chain?.id !== 11155111) {
        alert("⚠️ Change de réseau : Sepolia requis pour soumettre le KYC.");
        return;
      }

      const tx = await writeContract({
        address: CONTRACTS.kycRequestRegistry,
        abi: KYCABI,
        functionName: "submitKYC",
        args: [documentHash],
      });

      const hash = typeof tx === "string" ? tx : tx?.hash;
      if (!hash) return alert("Transaction envoyée, mais hash introuvable. Regarde la console.");

      setTxHash(hash);
      await waitForTransactionReceipt(config, { hash });

      alert("✅ KYC soumis et confirmé on-chain.");
      setEditMode(false);
    } catch (e2) {
      console.error(e2);
      alert(e2?.shortMessage || e2?.message || "Erreur submit KYC");
    }
  }

  if (!isConnected) {
    return (
      <div className="container">
        <h1>KYC</h1>
        <p className="muted">Connecte ton wallet pour soumettre ton KYC.</p>
      </div>
    );
  }

  const disableInputs = hasLocal && !editMode;
  const age = calcAge(form.birthDate);

  // ✅ petit style file input (sans toucher ton CSS global)
  const fileInputStyle = {
    display: "block",
    width: "100%",
    marginTop: 6,
    padding: "10px 12px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,.16)",
    background: "rgba(0,0,0,.25)",
    color: "rgba(255,255,255,.92)",
    fontFamily: "var(--font2)",
  };

  return (
    <div className="container">
      <div className="flex between" style={{ gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>KYC</h1>
          <p className="muted" style={{ margin: 0 }}>
            Wallet : <code>{wallet}</code>
          </p>
          {chain?.name && (
            <p className="muted" style={{ margin: "6px 0 0" }}>
              Réseau : <strong>{chain.name}</strong>
            </p>
          )}
        </div>

        <div className="flex" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          {hasLocal && !editMode && (
            <button className="crystalBtn crystalBtn--ghost" type="button" onClick={() => setEditMode(true)}>
              <span className="crystalBtn__shimmer" />
              <span style={{ position: "relative", zIndex: 2 }}>✏️ Modifier mes infos</span>
            </button>
          )}
          {hasLocal && editMode && (
            <button className="crystalBtn crystalBtn--ghost" type="button" onClick={() => setEditMode(false)}>
              <span className="crystalBtn__shimmer" />
              <span style={{ position: "relative", zIndex: 2 }}>Annuler</span>
            </button>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card__body">
          <h3 style={{ marginTop: 0 }}>Statut on-chain</h3>

          <div className="flex" style={{ gap: 10, flexWrap: "wrap" }}>
            <span className={`badge ${onchain.exists ? "badge--ok" : "badge--warn"}`}>
              {onchain.exists ? "Demande existante" : "Aucune demande"}
            </span>
            <span className={`badge ${onchain.approved ? "badge--ok" : "badge--warn"}`}>
              {onchain.approved ? "Approuvé" : "Non approuvé"}
            </span>
            <span className={`badge ${onchain.rejected ? "badge--danger" : "badge--neutral"}`}>
              {onchain.rejected ? "Rejeté" : "Non rejeté"}
            </span>
            <span className={`badge ${onchain.isVerified ? "badge--ok" : "badge--warn"}`}>
              {onchain.isVerified ? "Autorisé à acheter" : "Non autorisé à acheter"}
            </span>
          </div>

          {onchain.kycHash && onchain.kycHash !== ZERO && (
            <p className="muted" style={{ marginTop: 10 }}>
              Hash on-chain : <code>{onchain.kycHash}</code>
            </p>
          )}

          {txHash && (
            <p style={{ marginTop: 10 }}>
              TX : <code>{txHash}</code>{" "}
              <a
                className="link"
                href={`https://sepolia.etherscan.io/tx/${txHash}`}
                target="_blank"
                rel="noreferrer"
                style={{ marginLeft: 8 }}
              >
                Ouvrir ↗
              </a>
            </p>
          )}

          {onchain.approved && !onchain.isVerified && (
            <p className="muted" style={{ marginTop: 10 }}>
              ⚠️ Ton KYC est validé, mais tu n’es pas autorisé à acheter (compte gelé / contraintes légales).
            </p>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card__body">
          <div className="flex between" style={{ gap: 12, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0 }}>Informations KYC</h3>
            <span className={`badge ${editMode || !hasLocal ? "badge--warn" : "badge--ok"}`}>
              {editMode || !hasLocal ? "Édition" : "Enregistré"}
            </span>
          </div>

          <form onSubmit={handleSubmit} style={{ marginTop: 14, display: "grid", gap: 12 }}>
            <div className="grid2">
              <div>
                <label className="label">Prénom</label>
                <input className="input" name="firstname" value={form.firstname} onChange={updateField} disabled={disableInputs} required />
              </div>
              <div>
                <label className="label">Nom</label>
                <input className="input" name="lastname" value={form.lastname} onChange={updateField} disabled={disableInputs} required />
              </div>
            </div>

            <div className="grid2">
              <div>
                <label className="label">Date de naissance</label>
                <input className="input" type="date" name="birthDate" value={form.birthDate} onChange={updateField} disabled={disableInputs} required />
                {age !== null && (
                  <p className="muted" style={{ marginTop: 6 }}>
                    Âge : <strong>{age}</strong>
                  </p>
                )}
              </div>

              <div>
                <label className="label">Nationalité</label>
                <select className="input" name="nationality" value={form.nationality} onChange={updateField} disabled={disableInputs}>
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid2">
              <div>
                <label className="label">Résidence fiscale</label>
                <select className="input" name="taxCountry" value={form.taxCountry} onChange={updateField} disabled={disableInputs}>
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Pays</label>
                <select className="input" name="country" value={form.country} onChange={updateField} disabled={disableInputs}>
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid2">
              <div>
                <label className="label">Rue</label>
                <input className="input" name="street" value={form.street} onChange={updateField} disabled={disableInputs} required />
              </div>
              <div>
                <label className="label">Ville</label>
                <input className="input" name="city" value={form.city} onChange={updateField} disabled={disableInputs} required />
              </div>
            </div>

            <div className="divider" />

            <div>
              <label className="label">Pièce d’identité (PDF/JPG/PNG)</label>
              <input style={fileInputStyle} type="file" accept="application/pdf,image/*" disabled={disableInputs} onChange={(e) => handleFileChange("idDoc", e.target.files?.[0])} />
              {files.idDoc?.name && <p className="muted">Fichier : {files.idDoc.name}</p>}
            </div>

            <div>
              <label className="label">Justificatif de domicile</label>
              <input style={fileInputStyle} type="file" accept="application/pdf,image/*" disabled={disableInputs} onChange={(e) => handleFileChange("proofOfAddress", e.target.files?.[0])} />
              {files.proofOfAddress?.name && <p className="muted">Fichier : {files.proofOfAddress.name}</p>}
            </div>

            <div>
              <label className="label">Dernier avis d’imposition (optionnel)</label>
              <input style={fileInputStyle} type="file" accept="application/pdf,image/*" disabled={disableInputs} onChange={(e) => handleFileChange("taxNotice", e.target.files?.[0])} />
              {files.taxNotice?.name && <p className="muted">Fichier : {files.taxNotice.name}</p>}
            </div>

            <div className="flex" style={{ gap: 10, flexWrap: "wrap", marginTop: 6 }}>
              <button className="crystalBtn crystalBtn--gold" type="submit" disabled={isPending}>
                <span className="crystalBtn__shimmer" />
                <span style={{ position: "relative", zIndex: 2 }}>
                  {isPending
                    ? "Envoi..."
                    : hasLocal
                      ? editMode
                        ? "Mettre à jour & re-soumettre"
                        : "Soumettre"
                      : "Soumettre KYC"}
                </span>
              </button>
            </div>

            <p className="muted" style={{ marginTop: 6 }}>
              ⚠️ Version simple : les documents sont stockés côté navigateur (localStorage). En prod : stockage sécurisé + hash on-chain.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
