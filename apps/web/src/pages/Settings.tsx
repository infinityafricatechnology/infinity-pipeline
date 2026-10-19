import { type FormEvent, useState } from "react";
import { IconCopy, IconSpark, IconWarning } from "../components/icons";
import { Empty, Segmented, useToast } from "../components/ui";
import { api, useApi, useSave } from "../lib/api";
import { date } from "../lib/format";
import type { Me } from "../lib/types";

type Token = {
  id: number;
  name: string;
  kind: "claude" | "api";
  prefix: string;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
};
type Created = { value: string; name: string; expires_at: string | null; mcp_url: string | null };

const SERVER = "infinity-pipeline";

function Copyable({ text }: { text: string }) {
  const toast = useToast();
  return (
    <pre className="code">
      {text}
      <button
        type="button"
        className="btn icon-btn copy"
        aria-label="Copier"
        onClick={() => navigator.clipboard.writeText(text).then(() => toast("Copié dans le presse-papiers"))}
      >
        <IconCopy />
      </button>
    </pre>
  );
}

export function Settings() {
  const { data: me } = useApi<Me>("/me");
  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <div className="page-head">
        <h1 className="t-title">Réglages</h1>
      </div>
      <ConnectClaude />
      <Password />
      {me?.user.role === "admin" && <Users />}
    </div>
  );
}

function ConnectClaude() {
  const { data } = useApi<{ mcp_url: string | null; results: Token[] }>("/tokens");
  const save = useSave();
  const toast = useToast();
  const [days, setDays] = useState<"30" | "90" | "365" | "none">("90");
  const [name, setName] = useState("Claude");
  const [created, setCreated] = useState<Created | null>(null);
  const mcpUrl = created?.mcp_url ?? data?.mcp_url ?? "https://<adresse du connecteur>/mcp";
  const apiUrl = `${window.location.origin}/api/v1`;

  const generate = (event: FormEvent) => {
    event.preventDefault();
    save.mutate(
      { method: "post", path: "/tokens", body: { name, kind: "claude", days: days === "none" ? null : Number(days) } },
      {
        onSuccess: (result) => setCreated(result as Created),
        onError: (error) => toast(error.message, true),
      },
    );
  };
  const revoke = (token: Token) => {
    if (!window.confirm(`Révoquer le jeton « ${token.name} » ? Il cessera de fonctionner immédiatement.`)) return;
    save.mutate({ method: "del", path: `/tokens/${token.id}` }, { onSuccess: () => toast("Jeton révoqué") });
  };

  const token = created?.value ?? "<votre jeton>";
  const desktopConfig = JSON.stringify(
    { mcpServers: { [SERVER]: { command: "npx", args: ["-y", "mcp-remote", mcpUrl, "--header", "Authorization:${AUTH}"], env: { AUTH: `Bearer ${token}` } } } },
    null,
    2,
  );
  const active = data?.results.filter((t) => !t.revoked_at) ?? [];

  return (
    <section className="panel" aria-labelledby="claude">
      <div className="settings-block">
        <h2 className="t-headline" id="claude" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <IconSpark width={18} style={{ color: "var(--blue)" }} />
          Connecter Claude
        </h2>
        <p>
          Avec un jeton, Claude (Desktop ou Code) consulte et met à jour le pipeline en votre nom et avec vos droits : « fais-moi le point sur la CNPS », « passe
          l’affaire 8 en signature », « crée les actions du compte rendu ». Ses modifications sont signalées « via Claude » dans l’historique.
        </p>
      </div>

      <div className="settings-block">
        {created ? (
          <>
            <div className="callout">
              <IconWarning />
              <span>Ce jeton ne s’affichera qu’une fois. Copiez la configuration maintenant ; il vaut un mot de passe, ne le partagez pas.</span>
            </div>
            <div className="field" style={{ marginTop: 16 }}>
              <span className="label">Jeton « {created.name} »{created.expires_at ? `, valable jusqu’au ${date(created.expires_at, true)}` : ", sans expiration"}</span>
              <Copyable text={created.value} />
            </div>
          </>
        ) : (
          <form onSubmit={generate} style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
            <div className="field" style={{ flex: "1 1 200px" }}>
              <label htmlFor="token-name">Nom du jeton</label>
              <input id="token-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Claude Desktop, MacBook" />
            </div>
            <div className="field">
              <span className="label">Validité</span>
              <Segmented
                label="Validité"
                value={days}
                onChange={setDays}
                options={[
                  { value: "30", label: "30 jours" },
                  { value: "90", label: "90 jours" },
                  { value: "365", label: "1 an" },
                  { value: "none", label: "Sans fin" },
                ]}
              />
            </div>
            <button className="btn btn-primary" disabled={save.isPending}>
              Générer un jeton
            </button>
          </form>
        )}
      </div>

      <div className="settings-block">
        <h3 className="t-headline" style={{ fontSize: 15 }}>
          Claude Desktop
        </h3>
        <p>
          Paramètres de Claude Desktop, rubrique Developer, puis Edit Config : collez ce bloc dans <code>claude_desktop_config.json</code>, enregistrez, puis
          quittez et rouvrez Claude Desktop. Node.js doit être installé.
        </p>
        <Copyable text={desktopConfig} />
        <h3 className="t-headline" style={{ fontSize: 15, marginTop: 20 }}>
          Claude Code
        </h3>
        <Copyable text={`claude mcp add --transport http ${SERVER} ${mcpUrl} --header "Authorization: Bearer ${token}"`} />
        <h3 className="t-headline" style={{ fontSize: 15, marginTop: 20 }}>
          API directe
        </h3>
        <p>
          Le connecteur s’appuie sur l’API publique, décrite dans <a href="/api/v1/openapi.json">la spécification OpenAPI</a>. Pour un script :
        </p>
        <Copyable text={`curl -H "Authorization: Bearer ${token}" ${apiUrl}/summary`} />
      </div>

      <div className="settings-block">
        <h3 className="t-headline" style={{ fontSize: 15 }}>
          Vos jetons
        </h3>
        {active.length === 0 ? (
          <Empty title="Aucun jeton actif" />
        ) : (
          <div className="table-wrap" style={{ marginTop: 10, boxShadow: "none", border: "1px solid var(--hairline)" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Nom</th>
                  <th>Créé le</th>
                  <th>Expire</th>
                  <th className="hide-sm">Dernière utilisation</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {active.map((t) => {
                  const soon = t.expires_at && Date.parse(t.expires_at) - Date.now() < 14 * 86_400_000;
                  return (
                    <tr key={t.id} style={{ cursor: "default" }}>
                      <td className="cell-title">
                        {t.name}
                        <span className="cell-sub num">{t.prefix}…</span>
                      </td>
                      <td>{date(t.created_at.slice(0, 10), true)}</td>
                      <td style={soon ? { color: "var(--red)", fontWeight: 560 } : undefined}>{t.expires_at ? date(t.expires_at.slice(0, 10), true) : "Jamais"}</td>
                      <td className="hide-sm">{t.last_used_at ? date(t.last_used_at.slice(0, 10), true) : "Jamais"}</td>
                      <td className="right">
                        <button type="button" className="btn btn-plain btn-danger" onClick={() => revoke(t)}>
                          Révoquer
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function Password() {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await api.post("/me/password", { current, next });
      setCurrent("");
      setNext("");
      toast("Mot de passe modifié");
    } catch (error) {
      toast((error as Error).message, true);
    }
  };
  return (
    <section className="panel section" aria-labelledby="password">
      <form className="settings-block" onSubmit={submit}>
        <h2 className="t-headline" id="password">
          Mot de passe
        </h2>
        <div className="fields" style={{ marginTop: 14 }}>
          <div className="field">
            <label htmlFor="pw-current">Mot de passe actuel</label>
            <input id="pw-current" className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="pw-next">Nouveau mot de passe</label>
            <input id="pw-next" className="input" type="password" autoComplete="new-password" minLength={10} value={next} onChange={(e) => setNext(e.target.value)} required />
            <span className="hint">10 caractères au moins</span>
          </div>
        </div>
        <button className="btn" style={{ marginTop: 14 }}>
          Changer le mot de passe
        </button>
      </form>
    </section>
  );
}

function Users() {
  const { data } = useApi<{ results: { id: number; email: string; name: string; role: string }[] }>("/users");
  const save = useSave();
  const toast = useToast();
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "member" });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate(
      { method: "post", path: "/users", body: form },
      {
        onSuccess: () => {
          toast(`Compte créé pour ${form.name}`);
          setForm({ name: "", email: "", password: "", role: "member" });
        },
        onError: (error) => toast(error.message, true),
      },
    );
  };
  return (
    <section className="panel section" aria-labelledby="users">
      <div className="settings-block">
        <h2 className="t-headline" id="users">
          Utilisateurs
        </h2>
        <div className="group" style={{ marginTop: 12, boxShadow: "none", border: "1px solid var(--hairline)" }}>
          {data?.results.map((u) => (
            <div key={u.id} className="row flush" style={{ cursor: "default" }}>
              <span className="row-main">
                <span className="row-title">{u.name}</span>
                <span className="row-meta">{u.email}</span>
              </span>
              <span className="row-aside">{u.role === "admin" ? "Administrateur" : "Membre"}</span>
            </div>
          ))}
        </div>
      </div>
      <form className="settings-block" onSubmit={submit}>
        <h3 className="t-headline" style={{ fontSize: 15 }}>
          Ajouter un utilisateur
        </h3>
        <div className="fields" style={{ marginTop: 12 }}>
          <div className="field">
            <label htmlFor="u-name">Nom</label>
            <input id="u-name" className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="u-email">Adresse e-mail</label>
            <input id="u-email" className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="u-pw">Mot de passe provisoire</label>
            <input id="u-pw" className="input" minLength={10} required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="u-role">Rôle</label>
            <select id="u-role" className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="member">Membre</option>
              <option value="admin">Administrateur</option>
            </select>
          </div>
        </div>
        <button className="btn" style={{ marginTop: 14 }} disabled={save.isPending}>
          Créer le compte
        </button>
      </form>
    </section>
  );
}
