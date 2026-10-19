import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { IatMark } from "../components/Logo";
import { APP_NAME } from "../components/Shell";
import { api, ApiError } from "../lib/api";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Seulement une adresse interne : pas de redirection vers un autre site.
  const retour = params.get("retour");
  const target = retour && retour.startsWith("/") && !retour.startsWith("//") ? retour : "/";
  const client = useQueryClient();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api.post("/auth/login", { email, password });
      await client.invalidateQueries();
      navigate(target, { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Connexion impossible. Vérifiez votre réseau.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="login">
      <div className="login-art">
        <IatMark className="mark" />
        <p>Chaque affaire, chaque échéance, chaque client d’IAT, au même endroit.</p>
        <small>{APP_NAME} · Infinity Africa Technologies</small>
      </div>
      <div className="login-form">
        <form onSubmit={submit}>
          <img src="/logo-iat.webp" alt="Infinity Africa Technologies" />
          <h1 className="t-title">Connexion</h1>
          {retour && <p className="t-caption" style={{ margin: "-6px 0 0" }}>Connectez-vous pour ouvrir la page demandée.</p>}
          <div className="field">
            <label htmlFor="email">Adresse e-mail</label>
            <input id="email" className="input" type="email" autoComplete="username" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="password">Mot de passe</label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="btn btn-primary" style={{ height: 38 }} disabled={pending}>
            Se connecter
          </button>
          <p className="t-caption">Pas encore de compte ? Demandez-le à l’administrateur de l’application.</p>
        </form>
      </div>
    </div>
  );
}
