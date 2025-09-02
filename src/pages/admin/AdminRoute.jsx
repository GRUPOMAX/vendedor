import { Navigate } from "react-router-dom";
import { useAuth } from "../../state/auth";
import AdminDashboard from "./AdminDashboard";

export default function AdminRoute() {
  const { user } = useAuth();

  // evitar retornar antes de montar o dashboard por causa de hooks
  if (!user) return null; // ou um skeleton leve
  if (user.role !== "admin") return <Navigate to="/login" replace />;

  return <AdminDashboard />; // aqui dentro ficam TODOS os hooks
}
