import React from "react";
import "./index.css";
import { Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "./components/Layout.jsx";

import Home from "./pages/Home.jsx";
import Market from "./pages/Market.jsx";
import HouseDetail from "./pages/HouseDetail.jsx";
import KYC from "./pages/KYC.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Admin from "./pages/Admin.jsx";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/market" element={<Market />} />
        <Route path="/house/:tokenAddress" element={<HouseDetail />} />
        <Route path="/kyc" element={<KYC />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/admin" element={<Admin />} />
        {/* Fallback si l’URL ne matche rien */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
