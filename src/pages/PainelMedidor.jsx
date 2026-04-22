import { Navigate } from 'react-router-dom';

// Redireciona /medidor → /medidor/agenda
export default function PainelMedidor() {
  return <Navigate to="/medidor/agenda" replace />;
}
