import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AppProvider, useApp } from "@/context/AppContext";
import Nav from "@/components/Nav";
import Landing from "@/pages/Landing";
import Auth from "@/pages/Auth";
import Browse from "@/pages/Browse";
import Matches from "@/pages/Matches";
import Chats from "@/pages/Chats";
import Dates from "@/pages/Dates";
import Wallet from "@/pages/Wallet";
import Profile from "@/pages/Profile";
import Admin from "@/pages/Admin";
import { PaymentSuccess, PaymentCancel } from "@/pages/PaymentResult";

const Private = ({ children }) => {
  const { user, loading } = useApp();
  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;
  return children;
};

const Shell = () => (
  <>
    <Nav />
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/browse" element={<Private><Browse /></Private>} />
      <Route path="/matches" element={<Private><Matches /></Private>} />
      <Route path="/chats" element={<Private><Chats /></Private>} />
      <Route path="/dates" element={<Private><Dates /></Private>} />
      <Route path="/wallet" element={<Private><Wallet /></Private>} />
      <Route path="/profile" element={<Private><Profile /></Private>} />
      <Route path="/admin" element={<Private><Admin /></Private>} />
      <Route path="/payment/success" element={<PaymentSuccess />} />
      <Route path="/payment/cancel" element={<PaymentCancel />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </>
);

export default function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AppProvider>
          <Shell />
          <Toaster theme="dark" position="top-right" toastOptions={{ style: { background: "#161320", border: "1px solid rgba(225,29,72,0.3)", color: "#fff" } }}/>
        </AppProvider>
      </BrowserRouter>
    </div>
  );
}
