# Une API publique pensée pour un connecteur MCP

Claude doit pouvoir consulter et mettre à jour le pipeline (Claude Desktop pour l'équipe commerciale, Claude Code pour les développeurs), chacun avec ses droits. Comme pour Infinity Planning (ADR 0005 d'`asana-saver`), le serveur MCP est un programme séparé (`apps/mcp`, Python et FastMCP) qui n'appelle que l'API publique `/api/v1` avec le jeton de la personne. L'application ne contient donc aucune logique propre à Claude : elle expose une API complète, stable et documentée, et le connecteur la traduit en une trentaine d'outils orientés intention (`pipeline_overview`, `search_deals`, `update_deals`, `create_actions`…).

Ce que l'API garantit au connecteur :

- **Une spec OpenAPI 3.1 générée depuis les schémas de validation** (`/api/v1/openapi.json`) : elle ne peut pas diverger du code et chaque champ porte sa description en français.
- **Des jetons personnels** (`api_tokens`, empreinte SHA-256 seulement), créés et révoqués depuis la page « Connecter Claude ». Un jeton de type `claude` signe ses modifications « via Claude » dans le journal (`activity.via`).
- **Des écritures groupées tout ou rien** (`POST` et `PATCH /{ressource}/batch`, 100 éléments au plus), pour qu'un compte rendu de réunion devienne dix actions en un appel, sans état intermédiaire.
- **Des valeurs souples là où Claude écrit naturellement** : une étape s'envoie en code (`M5`) ou avec le libellé du classeur (`M5 – Négociation / signature`) ; `/lists` donne toutes les valeurs admises ; une erreur cite le champ fautif et les valeurs possibles.
- **Des vues composées** qui évitent les allers-retours : `/summary` (onglet Synthèse), `/agenda?days=7` (actions, relances, échéances), `/accounts/{slug}/overview` (fiche compte complète), `/me` (date du jour pour les dates relatives).
- **Une limite de 300 requêtes par minute et par jeton.**

## Options écartées

- **Un serveur MCP intégré au processus de l'API** : plus simple au départ, mais il contournerait la validation et les droits de l'API publique, et lierait le cycle de vie du connecteur à celui de l'application.
- **Une clé partagée par toute l'équipe** : toutes les actions seraient faites au nom d'un seul compte, sans traçabilité par personne.
- **OAuth 2.1 dès maintenant** : c'est ce qu'exige l'interface Connecteurs de claude.ai, mais il demande un serveur d'autorisation. Reporté ; les jetons Bearer suffisent pour Claude Desktop (via `mcp-remote`) et Claude Code.
