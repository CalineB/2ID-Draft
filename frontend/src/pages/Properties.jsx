import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { useWeb3 } from "../hooks/useWeb3";
import { ABIS, ADDRESSES } from "../config/contracts";

export default function Properties() {
  const { contracts, signer } = useWeb3();
  const [properties, setProperties] = useState([]);

  useEffect(() => {
    if (!contracts.tokenFactory || !signer) return;

    (async () => {
      const factory = contracts.tokenFactory;
      const count = await factory.getHouseTokenCount();

      const items = [];
      for (let i = 0n; i < count; i++) {
        const tokenAddr = await factory.allHouseTokens(i);
        const token = new ethers.Contract(tokenAddr, ABIS.houseToken, signer);

        const name = await token.name();
        const symbol = await token.symbol();
        const maxSupply = await token.maxSupply();
        const totalSupply = await token.totalSupply();


        const progress =
          maxSupply > 0n
            ? Number((totalSupply * 10000n) / maxSupply) / 100
            : 0;

        items.push({
          tokenAddr,
          name,
          symbol,
          maxSupply: maxSupply.toString(),
          totalSupply: totalSupply.toString(),
          progress, // 0–100
        });
      }
      setProperties(items);
    })();
  }, [contracts, signer]);

  return (
    <section className="card">
      <h1>Biens disponibles</h1>
      {properties.length === 0 && <p>Aucun bien créé pour l’instant.</p>}

      <div className="cards-grid">
        {properties.map((p) => (
          <article key={p.tokenAddr} className="property-card">
            <h2>{p.name} <span>({p.symbol})</span></h2>
            <p>Adresse du token : {p.tokenAddr}</p>
            <p>
              Obligations émises : {p.totalSupply} / {p.maxSupply}
            </p>
            <div className="progress-wrapper">
              <div className="progress-bar">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${p.progress}%` }}
                />
              </div>
              <span className="progress-label">
                {p.progress.toFixed(1)}% souscrit
              </span>
            </div>

            {/* ici tu rajoutes les infos « prix », « lieu », « rendement probable »
                que tu stockeras soit dans un contrat dédié, soit dans une DB off-chain */}

            {/* Bouton investir, qui ouvrira un modal/form et appellera HouseEthSale.buyTokens */}
          </article>
        ))}
      </div>
    </section>
  );
}
