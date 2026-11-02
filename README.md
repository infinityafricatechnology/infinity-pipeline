# Infinity Pipeline

Le pipeline commercial de deux filiales d'Infinity Africa, chacune dans son espace, avec ses données, sa navigation et ses couleurs :

- **IAT** (Infinity Africa Technologies, `/iat`), tiré du classeur `docs/PIPELINE_IAT_V3.xlsx` : affaires de M0 à M6, renouvellements et relances J-90 / J-30, facturation et encaissements par client, fiches comptes, solutions et prospects, appels d'offres, plan d'actions et base de 420 contacts ;
- **IAP** (Infinity Africa Properties, `/iap`), tiré de `docs/iap/PIPELINE IAP.xlsx` : affaires immobilières de P0 (mandat à signer) à P5 (conclu), commissions attendues et pondérées, répartition apporteur / closeur selon la fiche de commissionnement (`docs/iap/FICHE DE COMMISSIONNEMENT.pdf` : 5 %, 10 %, 15 % sur la commission perçue), plan d'actions et contacts.

Après connexion, un écran propose les espaces accessibles ; on passe de l'un à l'autre par le logo (barre latérale), la recherche ⌘K ou ⌘⇧E. Un administrateur voit les deux espaces ; pour un membre, les espaces se cochent dans Réglages > Utilisateurs (ou `pnpm user spaces <email> iat,iap`). Les anciennes adresses sans préfixe (`/affaires?affaire=8`) mènent à IAT.

Tout ce que le classeur calculait (montant pondéré, % rentabilité, échéances et alertes de renouvellement, totaux de la synthèse) est recalculé par l'application. Les chiffres de la vue d'ensemble correspondent à l'onglet « Synthèse ».

## Démarrer avec Docker

```bash
cp .env.example .env          # renseigner IAT_ADMIN_PASSWORD (sinon le mot de passe par défaut de docker-compose.yml s'applique)
docker compose up -d --build
```

L'application répond sur http://localhost:8300 et le connecteur Claude sur http://localhost:8311/mcp. Au premier démarrage, les données du classeur sont chargées et le compte administrateur est créé.

Le mot de passe de l'administrateur vient de `IAT_ADMIN_PASSWORD` (valeur par défaut dans `docker-compose.yml`, à remplacer par une variable d'environnement en production). Il est réappliqué à chaque démarrage tant que l'administrateur n'a pas choisi le sien dans Réglages ; ensuite, la configuration ne l'écrase plus. La base SQLite vit dans le volume `iat-data` : elle survit aux redémarrages et aux mises à jour de l'image.

- Journaux : `docker compose logs -f app`
- Ajouter un utilisateur : depuis l'application (Réglages), ou `docker compose exec app sh -c "cd apps/api && node src/cli/user.ts add prenom.nom@iat.ci 'Prénom Nom'"`
- Sauvegarde : copier `/data/iat.db` du volume (`docker compose cp app:/data/iat.db ./sauvegarde.db`)

## Développer

Node 24 et pnpm 11 sont requis (l'API s'exécute en TypeScript sans compilation et utilise `node:sqlite`).

```bash
pnpm install
pnpm seed                      # crée data/iat.db depuis data/seed.json et l'administrateur
pnpm dev                       # API sur :8300, interface sur http://localhost:5173
```

Réimporter le classeur après une mise à jour (nécessite [uv](https://docs.astral.sh/uv/)) :

```bash
pnpm import-xlsx               # docs/PIPELINE_IAT_V3.xlsx + factures des renouvellements → data/seed.json
pnpm import-iap                # docs/iap/PIPELINE IAP.xlsx → data/seed-iap.json
pnpm seed --force              # recharge les données métier (utilisateurs et jetons conservés)
```

Les données IAP sont chargées indépendamment : une base IAT déjà en service reçoit `data/seed-iap.json` au démarrage suivant si l'espace IAP est vide.

`pnpm seed` ne touche qu'une base vide. Pour reporter les compléments de facturation (n° de facture, détail, coordonnées de facturation) dans une base déjà en service, sans écraser les saisies, avec un jeton de Réglages > Connecter Claude :

```bash
PIPELINE_API_URL=https://… PIPELINE_API_TOKEN=… uv run tools/import/sync_api.py           # aperçu
PIPELINE_API_URL=https://… PIPELINE_API_TOKEN=… uv run tools/import/sync_api.py --apply   # écrit
```

## Structure

| Dossier | Contenu |
| --- | --- |
| `apps/api` | API Hono + SQLite. `src/domain.ts` : vocabulaire et règles de calcul du classeur IAT ; `src/domain-iap.ts` : étapes et commissionnement IAP ; `src/routes/resources.ts` et `src/routes/iap.ts` : une déclaration par entité ; `src/spaces.ts` : filiales et droits d'accès ; `src/schema.sql` : schéma |
| `apps/web` | Interface React (Vite), sans librairie de composants. `src/lib/space.tsx` : espaces et thème ; `src/components/nav.tsx` : navigation par espace ; `src/pages/iap/` : pages IAP ; `src/styles/app.css` : système visuel (accent bleu IAT, or IAP via `data-space`) |
| `apps/mcp` | Serveur MCP pour Claude (Python, FastMCP) |
| `tools/import` | Conversion des classeurs Excel en `data/seed.json` (IAT) et `data/seed-iap.json` (IAP) |
| `docs/adr` | Décisions d'architecture |

## Brancher Claude (MCP)

Le serveur MCP (`apps/mcp`, Python et FastMCP, sur le modèle d'Infinity Planning) démarre avec Docker Compose sur http://localhost:8311/mcp. Il expose une trentaine d'outils IAT (synthèse, agenda, affaires, comptes, renouvellements, actions, contacts, catalogue) et une douzaine d'outils IAP préfixés `iap_` (synthèse, affaires, commissions, actions, contacts) et n'appelle que l'API publique avec le jeton de chaque personne ; voir `apps/mcp/README.md` et `docs/adr/0001-api-publique-pour-claude.md`.

Pour chaque utilisateur :

1. Dans l'application, Réglages > Connecter Claude : générer un jeton (30 jours, 90 jours, 1 an ou sans fin, révocable).
2. Copier la configuration affichée dans Claude Desktop (via `mcp-remote`), ou lancer la commande `claude mcp add` pour Claude Code.

Les modifications faites par Claude apparaissent « via Claude » dans l'historique de chaque élément et dans le Journal.

L'API publique `/api/v1` est décrite en OpenAPI 3.1 sur `/api/v1/openapi.json` (300 requêtes par minute et par jeton, lots de 100 éléments tout ou rien, erreurs en français) :

```bash
curl -H "Authorization: Bearer iat_…" "http://localhost:8300/api/v1/deals?open=true&priority=P1"
```

## Guide utilisateur

`docs/Guide-utilisateur-Infinity-Pipeline.pptx` : neuf diapositives pour prendre l'application en main.
