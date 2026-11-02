import "@fontsource-variable/inter/opsz.css";
import "./styles/app.css";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, Outlet, RouterProvider, useLocation } from "react-router";
import { Shell } from "./components/Shell";
import { ConfirmProvider, Loading, ToastProvider } from "./components/ui";
import { ApiError, useApi } from "./lib/api";
import { MeContext, useMe } from "./lib/me";
import { type SpaceCode, SpaceProvider } from "./lib/space";
import type { Me } from "./lib/types";
import { AccountDetail } from "./pages/AccountDetail";
import { Accounts } from "./pages/Accounts";
import { ActionsPage } from "./pages/Actions";
import { ActivityPage } from "./pages/Activity";
import { Contacts } from "./pages/Contacts";
import { Deals } from "./pages/Deals";
import { IapCommissionsPage } from "./pages/iap/Commissions";
import { IapContacts } from "./pages/iap/Contacts";
import { IapDeals } from "./pages/iap/Deals";
import { IapOverview } from "./pages/iap/Overview";
import { Login } from "./pages/Login";
import { Overview } from "./pages/Overview";
import { Renewals } from "./pages/Renewals";
import { Settings } from "./pages/Settings";
import { Solutions } from "./pages/Solutions";
import { SpaceChooser } from "./pages/SpaceChooser";
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
  return (
    <MeContext.Provider value={data}>
      <Outlet />
    </MeContext.Provider>
  );
}

/** Un espace (filiale) : ses couleurs, sa navigation ; réservé aux comptes qui y ont accès. */
function SpaceLayout({ space }: { space: SpaceCode }) {
  const me = useMe();
  if (!me.user.spaces.includes(space)) return <Navigate to="/" replace />;
  return (
    <SpaceProvider space={space}>
      <Shell me={me} />
    </SpaceProvider>
  );
}

/** Anciennes adresses (avant les espaces), dont les liens déjà donnés par Claude : elles mènent à IAT. */
function LegacyRedirect() {
  const location = useLocation();
  return <Navigate to={`/iat${location.pathname}${location.search}`} replace />;
}

const router = createBrowserRouter([
  { path: "/connexion", element: <Login /> },
  {
    path: "/",
    element: <Authenticated />,
    children: [
      { index: true, element: <SpaceChooser /> },
      {
        path: "iat",
        element: <SpaceLayout space="iat" />,
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
          { path: "*", element: <Navigate to="/iat" replace /> },
        ],
      },
      {
        path: "iap",
        element: <SpaceLayout space="iap" />,
        children: [
          { index: true, element: <IapOverview /> },
          { path: "affaires", element: <IapDeals /> },
          { path: "commissions", element: <IapCommissionsPage /> },
          { path: "actions", element: <ActionsPage /> },
          { path: "contacts", element: <IapContacts /> },
          { path: "journal", element: <ActivityPage /> },
          { path: "reglages", element: <Settings /> },
          { path: "*", element: <Navigate to="/iap" replace /> },
        ],
      },
      { path: "*", element: <LegacyRedirect /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <ToastProvider>
        <ConfirmProvider>
          <RouterProvider router={router} />
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
