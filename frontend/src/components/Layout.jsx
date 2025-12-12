import React from "react";
import Header from "./Header.jsx";

export function Layout({ children }) {
  return (
    <>
      <Header />
      <main style={{ padding: "1rem" }}>
        {children}
      </main>
    </>
  );
}
