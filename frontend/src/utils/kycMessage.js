export function kycMessage({ exists, approved, rejected, isVerified }) {
  if (!exists)
    return {
      tone: "warn",
      text: "⚠️ Tu dois soumettre un KYC avant d’investir.",
    };

  if (rejected)
    return {
      tone: "danger",
      text: "❌ Ton KYC a été rejeté. Contacte le support.",
    };

  if (!approved)
    return {
      tone: "warn",
      text: "⏳ Ton KYC est en attente d’approbation.",
    };

  if (approved && !isVerified)
    return {
      tone: "warn",
      text:
        "⚠️ Ton KYC est validé, mais tu n’es pas autorisé à acheter (compte gelé / contraintes légales de conformité).",
    };

  return {
    tone: "ok",
    text: "✅ KYC validé et autorisé à acheter.",
  };
}
