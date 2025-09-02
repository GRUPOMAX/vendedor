import { Navigate } from "react-router-dom";
import { useAuth } from "../state/auth";

export default function ProtectedRoute({ children, allow = ["admin", "vendedor"] }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!allow.includes(user.role)) return <Navigate to="/login" replace />;
  return children;
}
