import React from "react";
import { Link } from "react-router-dom";

export default function Home() {
  return (
    <div style={{ maxWidth: 800 }}>
      <h1>Investir dans l'immobilier, simplement.</h1>
      <p>
        Sur cette plateforme, tu peux investir dans des biens immobiliers
        via des <strong>obligations tokenisées</strong>.
      </p>

      <h2>Comment ça marche ?</h2>
      <ol>
        <li>Tu connectes ton portefeuille (Metamask).</li>
        <li>Tu remplis ton KYC pour vérifier ton identité.</li>
        <li>Tu sélectionnes un bien immobilier et investis en ETH.</li>
        <li>Tu reçois des <strong>tokens</strong> qui représentent ta part dans le projet.</li>
      </ol>

      <p>
        Les transferts de tokens sont restreints aux investisseurs KYC, pour
        respecter les contraintes de conformité (PSFP, AMF).
      </p>

      <div style={{ marginTop: "2rem" }}>
        <Link to="/market">
          <button>Voir les biens disponibles</button>
        </Link>
      </div>
    </div>
  );
}
