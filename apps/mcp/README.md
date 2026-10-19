# Serveur MCP d'Infinity Pipeline

Permet à Claude (Claude Desktop, Claude Code) de consulter et de mettre à jour le pipeline avec les droits de la personne connectée. Le serveur n'appelle que l'API publique (`/api/v1`) avec le jeton de cette personne ; voir `docs/adr/0001-api-publique-pour-claude.md`. Les modifications apparaissent « via Claude » dans l'historique.

Les outils prennent des noms (« CNPS », « Orange ») et des numéros (« affaire 8 », « action 12 ») et les traduisent en identifiants ; un nom inconnu échoue avant toute écriture, en citant les valeurs possibles. Chaque élément renvoyé porte son lien vers l'application.

## Outils

Lecture (`readOnlyHint`) :

| Outil | Rôle |
| --- | --- |
| `whoami` | Personne connectée et date du jour |
| `pipeline_overview` | Synthèse : pipeline, pondéré, gagné, commissions, encaissements, répartitions, clients suivis |
| `agenda` | Actions, renouvellements et échéances d'affaires des N prochains jours (retards compris) |
| `search_deals`, `get_deal` | Affaires par compte, étape, responsable, priorité, texte ; détail et historique d'une affaire |
| `list_accounts`, `get_account` | Comptes ; fiche complète (facturation, affaires, renouvellements, stratégie, contacts) |
| `list_renewals` | Contrats récurrents, échéances, relances J-90 / J-30, alertes |
| `search_actions` | Plan d'actions (ouvertes, en retard, par responsable ou compte) |
| `search_contacts` | Base de contacts |
| `list_solutions`, `get_solution` | Catalogue, prospects et pitchs par segment |
| `list_tenders` | Appels d'offres |
| `recent_activity` | Journal des modifications, filtrable par canal |

Écriture (100 éléments au plus par appel, tout ou rien) :

| Outil | Rôle |
| --- | --- |
| `create_deals`, `update_deals` | Affaires ; seuls les champs donnés changent, `null` efface |
| `create_actions`, `update_actions` | Plan d'actions ; `status: "Fait"` coche une action |
| `update_renewals` | Statut, relance, nouvelle facturation d'un contrat |
| `create_accounts`, `update_account`, `create_opportunities` | Comptes et pistes de développement |
| `create_contacts`, `update_contacts` | Contacts |
| `create_invoices`, `update_invoices` | Facturation et encaissements |
| `create_prospects`, `update_prospects` | Prospects par solution |
| `delete_deal`, `delete_action` | Destructifs (`destructiveHint`) : Claude doit demander confirmation |

Non exposés volontairement : suppression de comptes, de contacts et de factures, gestion des utilisateurs et des jetons.

## Configuration

| Variable | Défaut | |
| --- | --- | --- |
| `PIPELINE_API_URL` | requis | API telle que le serveur l'atteint, ex. `http://app:8300` dans Docker |
| `PIPELINE_WEB_URL` | `PIPELINE_API_URL` | Application web, pour les liens donnés à Claude |
| `PIPELINE_API_TOKEN` | — | Jeton pour `stdio` (une seule personne) ; en HTTP chacun envoie le sien |
| `MCP_HOST` / `MCP_PORT` / `MCP_PATH` | `127.0.0.1` / `8311` / `/mcp` | Écoute HTTP |
| `MCP_PUBLIC_URL` | — | Adresse publique du serveur derrière un proxy |

Une requête sans jeton valide reçoit `401`. Un jeton est vérifié auprès de l'API, puis cru pendant 60 secondes.

## Lancer

Avec Docker, le service `mcp` de `docker-compose.yml` démarre avec l'application, sur http://localhost:8311/mcp.

En local :

```bash
cd apps/mcp
uv sync
PIPELINE_API_URL=http://localhost:8300 uv run infinity-pipeline-mcp
```

Générez un jeton dans l'application (Réglages > Connecter Claude), puis :

```bash
claude mcp add --transport http infinity-pipeline http://localhost:8311/mcp --header "Authorization: Bearer <jeton>"
```

## Tests

```bash
uv run pytest      # serveur en mémoire, API simulée avec respx
uv run ruff check
```
