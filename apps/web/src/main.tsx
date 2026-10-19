import "@fontsource-variable/inter/opsz.css";
import "./styles/app.css";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider, useLocation } from "react-router";
import { Shell } from "./components/Shell";
import { Loading, ToastProvider } from "./components/ui";
import { ApiError, useApi } from "./lib/api";
import type { Me } from "./lib/types";
import { AccountDetail } from "./pages/AccountDetail";
import { Accounts } from "./pages/Accounts";
import { ActionsPage } from "./pages/Actions";
import { ActivityPage } from "./pages/Activity";
import { Contacts } from "./pages/Contacts";
import { Deals } from "./pages/Deals";
import { Login } from "./pages/Login";
import { Overview } from "./pages/Overview";
import { Renewals } from "./pages/Renewals";
import { Settings } from "./pages/Settings";
import { Solutions } from "./pages/Solutions";
import { Tenders } from "./pages/Tenders";

/** Session expirée en cours de travail : retour à la connexion, puis à la page en cours. */
function onAuthError(error: unknown) {
  if (error instanceof ApiError && error.status === 401 && window.location.pathname !== "/connexion") {
    window.location.assign(`/connexion?retour=${encodeURIComponent(window.location.pathname + window.location.search)}`);
  }
}

const client = new QueryClient({
  queryCache: new QueryCache({ onError: onAuthError }),
  mutationCache: new MutationCache({ onError: onAuthError }),
  defaultOptions: {
    queries: {
      staleTime: 20_000,
      refetchOnWindowFocus: true,
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
    },
  },
});

/** Garde de session : redirige vers la connexion si l'API répond 401. */
function Authenticated() {
  const { data, error, isLoading } = useApi<Me>("/me");
  const location = useLocation();
  if (isLoading) return <div style={{ padding: 40 }}><Loading height={120} /></div>;
  if (error?.status === 401 || !data) {
    // Un lien partagé (ou donné par Claude) rouvre la bonne fiche après la connexion.
    const target = location.pathname + location.search;
    return <Navigate to={target === "/" ? "/connexion" : `/connexion?retour=${encodeURIComponent(target)}`} replace />;
  }
  return <Shell me={data} />;
}

const router = createBrowserRouter([
  { path: "/connexion", element: <Login /> },
  {
    path: "/",
    element: <Authenticated />,
    children: [
      { index: true, element: <Overview /> },
      { path: "affaires", element: <Deals /> },
      { path: "actions", element: <ActionsPage /> },
      { path: "renouvellements", element: <Renewals /> },
      { path: "comptes", element: <Accounts /> },
      { path: "comptes/:slug", element: <AccountDetail /> },
      { path: "solutions", element: <Solutions /> },
      { path: "appels-offres", element: <Tenders /> },
      { path: "contacts", element: <Contacts /> },
      { path: "journal", element: <ActivityPage /> },
      { path: "reglages", element: <Settings /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
