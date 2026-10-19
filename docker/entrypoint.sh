#!/bin/sh
# Premier démarrage : charge les données du classeur dans une base vide et crée l'administrateur
# (IAT_ADMIN_EMAIL / IAT_ADMIN_PASSWORD ; mot de passe généré et affiché dans les journaux sinon).
# Démarrages suivants : la base du volume est conservée telle quelle.
set -e
cd /app/apps/api
node --disable-warning=ExperimentalWarning src/cli/seed.ts
exec node --disable-warning=ExperimentalWarning src/index.ts
