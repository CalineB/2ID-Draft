import React from "react";

export default function CrystalButton({
  as = "button",
  tone = "blue",
  variant = "solid",
  className = "",
  children,
  ...props
}) {
  const Comp = as;
  const toneClass = tone === "gold" ? "crystalBtn--gold" : "crystalBtn--blue";
  const variantClass = variant === "ghost" ? "crystalBtn--ghost" : "";

  return (
    <Comp className={`crystalBtn ${toneClass} ${variantClass} ${className}`.trim()} {...props}>
      <span className="crystalBtn__shimmer" />
      <span style={{ position: "relative", zIndex: 2, display: "inline-flex", alignItems: "center", gap: 10 }}>
        {children}
      </span>
    </Comp>
  );
}
