"""Le serveur MCP d'Infinity Pipeline."""

from fastmcp import FastMCP

from .auth import PipelineTokenVerifier
from .deps import Deps
from .tools.iap import register_iap_tools
from .tools.read import register_read_tools
from .tools.write import register_write_tools

INSTRUCTIONS = """\
Infinity Pipeline est le pipeline commercial de deux filiales d'Infinity Africa (Côte d'Ivoire), chacune dans
son espace, avec ses propres données. Répondez en français.

- IAT (Infinity Africa Technologies, services informatiques) : outils sans préfixe (pipeline_overview,
  search_deals, get_account, create_actions…).
- IAP (Infinity Africa Properties, agence immobilière) : outils préfixés iap_ (iap_overview, iap_search_deals,
  iap_commissions, iap_update_deals…). Une « affaire IAP » est un bien ou un mandat (vente, location, recherche,
  gestion) : étapes P0 mandat à signer, P1 mandat signé, P2 présenté / visites, P3 offre / négociation,
  P4 acompte / compromis, P5 conclu, LOST perdu. Commission = montant × taux ; pondérée = × closing.
  Fiche de commissionnement (depuis le 14/09/2026) : apporteur 5 %, closeur 10 %, 15 % si la même personne
  apporte et conclut, calculés sur la commission effectivement perçue par IAP.
- Si la filiale n'est pas claire (« l'affaire 12 », « le pipeline »), demandez laquelle ; whoami indique les espaces
  accessibles (user.spaces). Ne mélangez jamais les chiffres des deux filiales.

Règles communes, avec les spécificités d'IAT :
- IAT : une affaire avance d'étape en étape : M0 à qualifier, M1 besoin identifié, M2 cadrage, M3 offre en préparation,
  M4 offre remise, M5 négociation / signature, M6 gagné ; ou LOST (perdu), CLOSED (clôturé).
- Montants en FCFA. Montant pondéré = montant × closing (probabilité de signature entre 0 et 1).
  Ces valeurs dérivées, comme les totaux et les alertes, sont calculées par l'application : ne les écrivez jamais.
- Désignez une affaire ou une action par son numéro (« affaire 8 »), un compte par son nom ; donnez le lien
  de chaque élément cité.
- IAT, renouvellements : échéance = dernière facturation + 12 mois, relances à J-90 et J-30.
- Appelez whoami pour la date du jour avant de raisonner sur « cette semaine » ou « en retard ».
- Pour un point général, commencez par pipeline_overview ou agenda (IAT), iap_overview (IAP) ;
  pour un client IAT, get_account ; pour une affaire IAP, iap_get_deal.
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
    register_iap_tools(mcp, deps)
    return mcp
