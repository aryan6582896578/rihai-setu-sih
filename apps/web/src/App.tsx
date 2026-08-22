import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuthStore } from "./state/authStore";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import HomePage from "./features/home/HomePage";
import LoginPage from "./features/auth/LoginPage";
import JailsPage from "./features/jails/JailsPage";
import JailDetailPage from "./features/jails/JailDetailPage";
import PrisonersPage from "./features/prisoners/PrisonersPage";
import PrisonerProfilePage from "./features/prisoners/PrisonerProfilePage";
import SuperintendentPage from "./features/superintendent/SuperintendentPage";
import CourtTrackingPage from "./features/court/CourtTrackingPage";
import LegalAidPage from "./features/court/LegalAidPage";
import OvercrowdingPage from "./features/overcrowding/OvercrowdingPage";
import RollupPage from "./features/overcrowding/RollupPage";

export default function App() {
  const status = useAuthStore((s) => s.status);
  const bootstrap = useAuthStore((s) => s.bootstrap);

  useEffect(() => {
    if (status === "idle") void bootstrap();
  }, [status, bootstrap]);

  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/jails" element={<JailsPage />} />
          <Route path="/jails/:jailId" element={<JailDetailPage />} />
          <Route path="/jails/:jailId/prisoners" element={<PrisonersPage />} />
          <Route path="/jails/:jailId/prisoners/:prisonerId" element={<PrisonerProfilePage />} />
          <Route path="/jails/:jailId/superintendent" element={<SuperintendentPage />} />
          <Route path="/jails/:jailId/court-tracking" element={<CourtTrackingPage />} />
          <Route path="/jails/:jailId/legal-aid" element={<LegalAidPage />} />
          <Route path="/jails/:jailId/overcrowding" element={<OvercrowdingPage />} />
          <Route path="/overcrowding" element={<RollupPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
