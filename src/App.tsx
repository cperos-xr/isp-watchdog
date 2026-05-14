import { NavLink, Route, Routes, Navigate } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import History from "./pages/History";
import Evidence from "./pages/Evidence";
import Templates from "./pages/Templates";
import Settings from "./pages/Settings";
import Donate from "./pages/Donate";

export default function App() {
  return (
    <div className="app">
      <nav className="sidebar">
        <h1>ISP WATCHDOG</h1>
        <NavLink to="/dashboard">Dashboard</NavLink>
        <NavLink to="/history">History</NavLink>
        <NavLink to="/evidence">Evidence</NavLink>
        <NavLink to="/templates">Complaint Drafts</NavLink>
        <NavLink to="/settings">Settings</NavLink>
        <div style={{ flex: 1 }} />
        <NavLink to="/donate">♥ Donate</NavLink>
      </nav>
      <main className="main">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/history" element={<History />} />
          <Route path="/evidence" element={<Evidence />} />
          <Route path="/templates" element={<Templates />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/donate" element={<Donate />} />
        </Routes>
      </main>
    </div>
  );
}
