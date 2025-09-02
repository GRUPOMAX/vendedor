import { Navigate } from "react-router-dom";
import { useAuth } from "../state/auth";

export default function HomeRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return user.role === "admin"
    ? <Navigate to="/admin" replace />
    : <Navigate to="/vendedor" replace />;
}
