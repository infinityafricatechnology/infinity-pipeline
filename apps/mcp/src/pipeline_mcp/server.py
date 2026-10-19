"""Le serveur MCP d'Infinity Pipeline."""

from fastmcp import FastMCP

from .auth import PipelineTokenVerifier
from .deps import Deps
from .tools.read import register_read_tools
from .tools.write import register_write_tools

INSTRUCTIONS = """\
Infinity Pipeline est le pipeline commercial d'IAT (Infinity Africa Technologies, Côte d'Ivoire).
Répondez en français.

- Une affaire avance d'étape en étape : M0 à qualifier, M1 besoin identifié, M2 cadrage, M3 offre en préparation,
  M4 offre remise, M5 négociation / signature, M6 gagné ; ou LOST (perdu), CLOSED (clôturé).
- Montants en FCFA. Montant pondéré = montant × closing (probabilité de signature entre 0 et 1).
  Ces valeurs dérivées, comme les totaux et les alertes, sont calculées par l'application : ne les écrivez jamais.
- Désignez une affaire ou une action par son numéro (« affaire 8 »), un compte par son nom ; donnez le lien
  de chaque élément cité.
- Renouvellements : échéance = dernière facturation + 12 mois, relances à J-90 et J-30.
- Appelez whoami pour la date du jour avant de raisonner sur « cette semaine » ou « en retard ».
- Pour un point général, commencez par pipeline_overview ou agenda ; pour un client, get_account.
- Groupez les écritures (les outils create_* et update_* prennent des listes, tout ou rien).
- Avant un lot important de modifications, montrez ce que vous allez faire et attendez l'accord.
  Avant de supprimer une affaire ou une action, demandez confirmation.
- Tout se fait avec les droits de la personne connectée ; ses modifications apparaissent « via Claude ».
"""


def create_server(deps: Deps, *, authenticate: bool = True) -> FastMCP:
    """``authenticate`` est désactivé en stdio et dans les tests, où le jeton vient des réglages."""
    auth = PipelineTokenVerifier(deps.settings, deps.transport) if authenticate else None
    mcp = FastMCP(name="Infinity Pipeline", instructions=INSTRUCTIONS, auth=auth)
    register_read_tools(mcp, deps)
    register_write_tools(mcp, deps)
    return mcp
