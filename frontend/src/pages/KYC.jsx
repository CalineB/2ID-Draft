import React, { useState, useEffect } from "react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { keccak256, toUtf8Bytes } from "ethers";
import { CONTRACTS } from "../config/contracts.js";

import KYCRequestJSON from "../abis/KYCRequestRegistry.json";
import IdentityJSON from "../abis/IdentityRegistry.json";

const KYCRequestABI = KYCRequestJSON.abi;
const IdentityABI = IdentityJSON.abi;

export default function KYC() {
  const { address, isConnected } = useAccount();
  const { writeContractAsync, isPending } = useWriteContract();

  const [form, setForm] = useState({
    firstname: "",
    lastname: "",
    street: "",
    city: "",
    country: "",
    zip: "",
    nationality: "",
    taxCountry: "FR",
  });

  const [idFile, setIdFile] = useState(null);
  const [proofFile, setProofFile] = useState(null);

  const [txHash, setTxHash] = useState(null);
  const [hashPreview, setHashPreview] = useState(null);

  // ===== 1) Pré-remplir le formulaire si déjà sauvegardé en localStorage =====
  useEffect(() => {
    if (!address) return;
    try {
      const all = JSON.parse(localStorage.getItem("kycForms") || "{}");
      const rec = all[address.toLowerCase()];
      if (rec && rec.form) {
        setForm(rec.form);
      }
    } catch (err) {
      console.error("Erreur lecture kycForms localStorage:", err);
    }
  }, [address]);

  // ===== 2) Lecture du statut KYC on-chain =====
  const { data: kycRequestRaw } = useReadContract({
    address: CONTRACTS.kycRequestRegistry,
    abi: KYCRequestABI,
    functionName: "requests",
    args: address ? [address] : undefined,
    query: {
      enabled: isConnected && !!address,
    },
  });

  const { data: isVerified } = useReadContract({
    address: CONTRACTS.identityRegistry,
    abi: IdentityABI,
    functionName: "isVerified",
    args: address ? [address] : undefined,
    query: {
      enabled: isConnected && !!address,
    },
  });

 
  let exists = false;
  let approved = false;
  let rejected = false;

  if (kycRequestRaw) {
    if (Array.isArray(kycRequestRaw)) {
      exists = Boolean(kycRequestRaw[1]);
      approved = Boolean(kycRequestRaw[2]);
      rejected = Boolean(kycRequestRaw[3]);
    } else if (typeof kycRequestRaw === "object") {
      // au cas où ton ABI retournerait un objet nommé
      exists = Boolean(kycRequestRaw.exists);
      approved = Boolean(kycRequestRaw.approved);
      rejected = Boolean(kycRequestRaw.rejected);
    }
  }

  let kycStatusLabel = "Aucune demande KYC trouvée.";
  if (exists) {
    if (approved && !rejected) {
      if (isVerified) {
        kycStatusLabel =
          "✅ KYC validé et wallet whiteliste. Tu peux investir.";
      } else {
        kycStatusLabel =
          "✅ KYC approuvé, en attente de mise à jour du wallet (whitelisting).";
      }
    } else if (!approved && !rejected) {
      kycStatusLabel = "⏳ KYC en cours de traitement par l'équipe conformité.";
    } else if (rejected) {
      kycStatusLabel = "❌ KYC refusé.";
    }
  }

  // ===== 3) Handlers formulaire =====

  function updateField(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleIdFile(e) {
    const f = e.target.files?.[0] || null;
    setIdFile(f);
  }

  function handleProofFile(e) {
    const f = e.target.files?.[0] || null;
    setProofFile(f);
  }

  // ===== 4) Submit KYC : on-chain + sauvegarde localStorage pour l'admin =====

  async function handleSubmit(e) {
    e.preventDefault();

    if (!isConnected || !address) {
      alert("Connecte ton wallet d'abord via le bouton en haut.");
      return;
    }

    if (!idFile || !proofFile) {
      alert("Merci d'importer ta pièce d'identité et ton justificatif de domicile.");
      return;
    }

    // Ce qu'on hash : les infos texte + le wallet
    const payload = {
      ...form,
      wallet: address,
    };

    const json = JSON.stringify(payload);
    const hash = keccak256(toUtf8Bytes(json));
    setHashPreview(hash);

    try {
      const tx = await writeContractAsync({
        address: CONTRACTS.kycRequestRegistry,
        abi: KYCRequestABI,
        functionName: "submitKYC",
        args: [hash],
        gas: BigInt(500000),
      });

      const txHashValue =
        typeof tx === "string" ? tx : tx?.hash ?? JSON.stringify(tx);
      setTxHash(txHashValue);

      alert("Demande KYC envoyée sur la blockchain. Elle est en cours d'examen.");

      // 🟢 Sauvegarde pour l'admin dans localStorage.kycForms
      try {
        const key = address.toLowerCase();
        const existing = JSON.parse(localStorage.getItem("kycForms") || "{}");

        existing[key] = {
          wallet: address,
          form: { ...form },
          hash,
          createdAt: Date.now(),
        };

        localStorage.setItem("kycForms", JSON.stringify(existing));
      } catch (err) {
        console.error("Erreur sauvegarde kycForms localStorage:", err);
      }
    } catch (err) {
      console.error(err);
      alert(err?.shortMessage || err?.message || "Erreur lors de l'envoi du KYC");
    }
  }

  // ===== 5) Render =====

  return (
    <div style={{ maxWidth: 600 }}>
      <h1>Formulaire KYC</h1>
      <p>
        Ces informations seront utilisées pour vérifier ton identité
        (conformité PSFP). Une fois validé par l&apos;équipe conformité,
        ton wallet sera autorisé à investir.
      </p>

      {!isConnected && (
        <p style={{ color: "red" }}>
          ⚠️ Tu dois d&apos;abord connecter ton wallet
          (bouton &quot;Se connecter&quot; en haut).
        </p>
      )}

      <div
        style={{
          marginBottom: "1rem",
          padding: "0.75rem",
          background: "#f5f5f5",
          borderRadius: 8,
        }}
      >
        <strong>Statut KYC :</strong>
        <div>{kycStatusLabel}</div>
      </div>

      <form onSubmit={handleSubmit}>
        <div>
          <label>Prénom</label>
          <input
            name="firstname"
            value={form.firstname}
            onChange={updateField}
            required
          />
        </div>

        <div>
          <label>Nom</label>
          <input
            name="lastname"
            value={form.lastname}
            onChange={updateField}
            required
          />
        </div>

        <div>
          <label>Adresse</label>
          <input
            name="street"
            value={form.street}
            onChange={updateField}
            required
          />
        </div>

        <div>
          <label>Ville</label>
          <input
            name="city"
            value={form.city}
            onChange={updateField}
            required
          />
        </div>

        <div>
          <label>Pays</label>
          <input
            name="country"
            value={form.country}
            onChange={updateField}
            required
          />
        </div>

        <hr style={{ margin: "1.5rem 0" }} />

        <h2>Pièces justificatives</h2>

        <div style={{ marginBottom: "1rem" }}>
          <label>Carte d&apos;identité (image ou PDF)</label>
          <input
            type="file"
            accept="image/*,.pdf"
            onChange={handleIdFile}
            required
          />
          {idFile && <p>Fichier sélectionné : {idFile.name}</p>}
        </div>

        <div style={{ marginBottom: "1rem" }}>
          <label>Justificatif de domicile (image ou PDF)</label>
          <input
            type="file"
            accept="image/*,.pdf"
            onChange={handleProofFile}
            required
          />
          {proofFile && <p>Fichier sélectionné : {proofFile.name}</p>}
        </div>

        <button type="submit" disabled={isPending || !isConnected}>
          {isPending ? "Transaction en cours..." : "Envoyer mon KYC"}
        </button>
      </form>

      {hashPreview && (
        <p style={{ marginTop: "1rem", fontSize: "0.85rem", color: "#555" }}>
          Hash KYC (infos texte + wallet) :<br />
          <code>{hashPreview}</code>
        </p>
      )}

      {txHash && (
        <p style={{ marginTop: "1rem" }}>
          Transaction envoyée (testnet) :<br />
          <code>{txHash}</code>
        </p>
      )}
    </div>
  );
}
