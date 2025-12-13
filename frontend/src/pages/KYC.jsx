import React, { useEffect, useMemo, useState } from "react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { keccak256, toBytes } from "viem";
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

function calcAge(birthDateISO) {
  if (!birthDateISO) return null;
  const birth = new Date(birthDateISO);
  if (Number.isNaN(birth.getTime())) return null;

  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

function kycMessage({ exists, approved, rejected, isVerified }) {
  if (!exists) return { tone: "warn", text: "⚠️ Tu dois soumettre un KYC avant d’investir." };
  if (rejected) return { tone: "danger", text: "❌ Ton KYC a été rejeté. Contacte le support." };
  if (!approved) return { tone: "warn", text: "⏳ Ton KYC est en attente d’approbation." };
  if (approved && !isVerified)
    return {
      tone: "warn",
      text: "⚠️ Ton KYC est validé, mais tu n’es pas autorisé à acheter (compte gelé / contraintes légales).",
    };
  return { tone: "ok", text: "✅ KYC validé et autorisé à acheter." };
}

export default function KYC() {
  const { address, isConnected } = useAccount();
  const { writeContract, isPending } = useWriteContract();

  const wallet = address || "";

  // -------------------- On-chain status --------------------
  const { data: req } = useReadContract({
    address: CONTRACTS.kycRequestRegistry,
    abi: KYCABI,
    functionName: "requests",
    args: isValidAddress(wallet) ? [wallet] : undefined,
    query: { enabled: isConnected && isValidAddress(wallet) },
  });

  const { data: isVerified } = useReadContract({
    address: CONTRACTS.identityRegistry,
    abi: IdentityABI,
    functionName: "isVerified",
    args: isValidAddress(wallet) ? [wallet] : undefined,
    query: { enabled: isConnected && isValidAddress(wallet) },
  });

  const onchain = useMemo(() => {
    let kycHash = null;
    let exists = false;
    let approved = false;
    let rejected = false;

    if (Array.isArray(req) && req.length >= 4) {
      kycHash = req[0];
      exists = Boolean(req[1]);
      approved = Boolean(req[2]);
      rejected = Boolean(req[3]);
    }

    return { exists, approved, rejected, isVerified: Boolean(isVerified), kycHash };
  }, [req, isVerified]);

  // -------------------- local saved --------------------
  const savedLocal = useMemo(() => {
    if (!wallet) return null;
    const all = loadKycForms();
    const k1 = wallet.toLowerCase();
    const k2 = wallet;
    return all[k1] || all[k2] || null;
  }, [wallet]);

  const hasLocal = Boolean(savedLocal?.form);

  // -------------------- edit mode --------------------
  const [editMode, setEditMode] = useState(false);

  // -------------------- form state --------------------
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
    idDoc: null, // { name, type, size, dataUrl }
    proofOfAddress: null,
    taxNotice: null,
  });

  // Pré-remplissage + gestion cas "on-chain existe mais pas local"
  useEffect(() => {
    if (!isConnected || !wallet) return;

    if (savedLocal?.form) {
      setForm((prev) => ({ ...prev, ...savedLocal.form }));
      setFiles((prev) => ({ ...prev, ...(savedLocal.files || {}) }));
      setEditMode(false);
      return;
    }

    // si pas de local mais déjà une demande on-chain => on laisse saisir
    if (onchain.exists) {
      setEditMode(true);
    } else {
      setEditMode(true); // premier KYC => saisie
    }
  }, [isConnected, wallet, savedLocal, onchain.exists]);

  const inputDisabled = hasLocal ? !editMode : false;

  function updateField(e) {
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }));
  }

  async function handleFileChange(key, file) {
    if (!file) return;

    if (file.size > 2.5 * 1024 * 1024) {
      alert("Fichier trop lourd (> 2.5MB). Réduis ou compresse.");
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

  // Compliance
  const age = calcAge(form.birthDate);
  const complianceError = useMemo(() => {
    if (!form.birthDate) return "Date de naissance requise.";
    if (age === null) return "Date de naissance invalide.";
    if (age < 18) return "Tu dois avoir 18 ans minimum.";
    if (form.nationality !== "France") return "Nationalité non éligible (exigé : France).";
    if (form.taxCountry !== "France") return "Résidence fiscale non éligible (exigé : France).";
    return null;
  }, [form.birthDate, form.nationality, form.taxCountry, age]);

  async function handleSubmit(e) {
    e.preventDefault();

    if (!isConnected) {
      alert("Connecte ton wallet d’abord.");
      return;
    }

    if (complianceError) {
      alert(`Non autorisé : ${complianceError}`);
      return;
    }

    if (!files.idDoc || !files.proofOfAddress) {
      alert("Merci d’uploader au minimum : pièce d’identité + justificatif de domicile.");
      return;
    }

    const fileMeta = {
      idDoc: files.idDoc ? { name: files.idDoc.name, type: files.idDoc.type, size: files.idDoc.size } : null,
      proofOfAddress: files.proofOfAddress
        ? { name: files.proofOfAddress.name, type: files.proofOfAddress.type, size: files.proofOfAddress.size }
        : null,
      taxNotice: files.taxNotice ? { name: files.taxNotice.name, type: files.taxNotice.type, size: files.taxNotice.size } : null,
    };

    const payload = {
      wallet,
      form,
      files, // base64 local
      createdAt: Date.now(),
    };

    const hashPayload = { wallet, form, fileMeta };
    const documentHash = computeKycHash(hashPayload);

    try {
      // 1) save local
      saveLocal(payload);

      // 2) send on-chain
      await writeContract({
        address: CONTRACTS.kycRequestRegistry,
        abi: KYCABI,
        functionName: "submitKYC",
        args: [documentHash],
      });

      alert("KYC soumis. En attente de validation.");
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

  const msg = kycMessage(onchain);

  return (
    <div className="container">
      <div className="flex between" style={{ gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>KYC</h1>
          <p className="muted" style={{ margin: 0 }}>
            Wallet : <code>{wallet}</code>
          </p>
        </div>

        <div className="flex" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <span className={`badge badge--${msg.tone}`}>{msg.text}</span>

          {(hasLocal || onchain.exists) && !editMode && (
            <button className="btn btn--ghost" type="button" onClick={() => setEditMode(true)}>
              ✏️ Modifier mes infos
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

          {complianceError && editMode && (
            <p style={{ marginTop: 10, color: "#b00020" }}>
              ⚠️ Non autorisé : {complianceError}
            </p>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card__body">
          <div className="flex between" style={{ gap: 12, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0 }}>Informations KYC</h3>
            <span className={`badge ${editMode || !hasLocal ? "badge--warn" : "badge--ok"}`}>
              {editMode || !hasLocal ? "Édition" : "Enregistré (local)"}
            </span>
          </div>

          {!hasLocal && (
            <p className="muted" style={{ marginTop: 10 }}>
              Aucun KYC enregistré côté navigateur. Remplis le formulaire ci-dessous.
            </p>
          )}

          {hasLocal && !editMode && (
            <p className="muted" style={{ marginTop: 10 }}>
              Tes infos sont pré-remplies. Clique sur “Modifier mes infos” pour changer.
            </p>
          )}

          <form onSubmit={handleSubmit} style={{ marginTop: 14, display: "grid", gap: 12 }}>
            <div className="grid2">
              <div>
                <label>Prénom</label>
                <input name="firstname" value={form.firstname} onChange={updateField} disabled={inputDisabled} required />
              </div>
              <div>
                <label>Nom</label>
                <input name="lastname" value={form.lastname} onChange={updateField} disabled={inputDisabled} required />
              </div>
            </div>

            <div className="grid2">
              <div>
                <label>Date de naissance</label>
                <input type="date" name="birthDate" value={form.birthDate} onChange={updateField} disabled={inputDisabled} required />
                {age !== null && <p className="muted" style={{ marginTop: 6 }}>Âge : {age} ans</p>}
              </div>

              <div>
                <label>Nationalité</label>
                <select name="nationality" value={form.nationality} onChange={updateField} disabled={inputDisabled}>
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid2">
              <div>
                <label>Résidence fiscale</label>
                <select name="taxCountry" value={form.taxCountry} onChange={updateField} disabled={inputDisabled}>
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label>Pays</label>
                <select name="country" value={form.country} onChange={updateField} disabled={inputDisabled}>
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid2">
              <div>
                <label>Rue</label>
                <input name="street" value={form.street} onChange={updateField} disabled={inputDisabled} required />
              </div>
              <div>
                <label>Ville</label>
                <input name="city" value={form.city} onChange={updateField} disabled={inputDisabled} required />
              </div>
            </div>

            <hr style={{ opacity: 0.25, margin: "6px 0" }} />

            <div>
              <label>Pièce d’identité (PDF/JPG/PNG)</label>
              <input type="file" accept="application/pdf,image/*" disabled={inputDisabled}
                onChange={(e) => handleFileChange("idDoc", e.target.files?.[0])}
              />
              {files.idDoc?.name && <p className="muted">Fichier : {files.idDoc.name}</p>}
            </div>

            <div>
              <label>Justificatif de domicile</label>
              <input type="file" accept="application/pdf,image/*" disabled={inputDisabled}
                onChange={(e) => handleFileChange("proofOfAddress", e.target.files?.[0])}
              />
              {files.proofOfAddress?.name && <p className="muted">Fichier : {files.proofOfAddress.name}</p>}
            </div>

            <div>
              <label>Dernier avis d’imposition (optionnel)</label>
              <input type="file" accept="application/pdf,image/*" disabled={inputDisabled}
                onChange={(e) => handleFileChange("taxNotice", e.target.files?.[0])}
              />
              {files.taxNotice?.name && <p className="muted">Fichier : {files.taxNotice.name}</p>}
            </div>

            <div className="flex" style={{ gap: 10, flexWrap: "wrap", marginTop: 6 }}>
              <button
                className="btn"
                type="submit"
                disabled={isPending || inputDisabled || Boolean(complianceError)}
                title={inputDisabled ? "Clique sur Modifier d’abord" : ""}
              >
                {isPending ? "Envoi..." : (onchain.exists ? "Mettre à jour & soumettre" : "Soumettre KYC")}
              </button>

              {editMode && hasLocal && (
                <button className="btn btn--ghost" type="button" onClick={() => {
                  // reset to saved local + exit edit
                  const all = loadKycForms();
                  const s = all[wallet.toLowerCase()] || all[wallet] || null;
                  if (s?.form) {
                    setForm((prev) => ({ ...prev, ...s.form }));
                    setFiles((prev) => ({ ...prev, ...(s.files || {}) }));
                  }
                  setEditMode(false);
                }}>
                  Annuler
                </button>
              )}
            </div>

            <p className="muted" style={{ marginTop: 6 }}>
              ⚠️ Version simple : documents stockés côté navigateur (localStorage).  
              Pour prod : stockage sécurisé (DB) ou IPFS + chiffrement, et on-chain uniquement un hash.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
