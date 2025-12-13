import React from "react";

export function kycMessage({ exists, approved, rejected, isVerified }) {
  if (!exists) return { tone: "warn", text: "⚠️ Tu dois soumettre un KYC avant d’investir." };
  if (rejected) return { tone: "danger", text: "❌ Ton KYC a été rejeté. Contacte le support." };
  if (!approved) return { tone: "warn", text: "⏳ Ton KYC est en attente d’approbation." };
  if (approved && !isVerified)
    return {
      tone: "warn",
      text: "⚠️ KYC validé, mais achats non autorisés (compte gelé / contraintes légales).",
    };
  return { tone: "ok", text: "✅ KYC validé et autorisé à acheter." };
}

export default function KycBadge(props) {
  const msg = kycMessage(props);
  return <div className={`badge badge--${msg.tone}`}>{msg.text}</div>;
}
