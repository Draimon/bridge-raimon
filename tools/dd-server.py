# Serveur double mort (solveur DDS en C via la bibliothèque endplay) pour les bancs d'essai du robot.
# Une requête JSON par ligne sur stdin, une réponse JSON par ligne sur stdout.
# Requête : { "hands": {"N": "AK5.QJ2.-.T987", ...} (cartes au début de la levée en cours, ordre ♠.♥.♦.♣),
#             "trump": "S"|"H"|"D"|"C"|"NT", "first": "N" (qui a entamé la levée en cours),
#             "trick": ["SA", "S2"] (cartes déjà posées dans la levée, ex. "HT" = 10♥) }
# Réponse : { "cards": {"S3": 9, "SK": 8, ...} } = levées que fera le camp du joueur au trait selon la carte jouée.
import sys, json
from endplay.types import Deal, Denom, Player, Card
from endplay.dds import solve_board

DEN = {"S": Denom.spades, "H": Denom.hearts, "D": Denom.diamonds, "C": Denom.clubs, "NT": Denom.nt}
SYM = str.maketrans({"♠": "S", "♥": "H", "♦": "D", "♣": "C"})
PL = {"N": Player.north, "E": Player.east, "S": Player.south, "O": Player.west, "W": Player.west}

def handle(q):
    h = q["hands"]
    pbn = "N:" + " ".join(h[s].replace("-", "") for s in ["N", "E", "S", "O"])
    d = Deal(pbn)
    d.first = PL[q["first"]]
    d.trump = DEN[q["trump"]]
    for c in q.get("trick", []):
        d.play(Card(c))
    out = {}
    for card, tricks in solve_board(d):
        s = str(card).translate(SYM)   # "♠A" → "SA"
        out[s] = tricks
    return {"cards": out}

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        res = handle(json.loads(line))
    except Exception as e:  # noqa
        res = {"error": str(e)}
    sys.stdout.write(json.dumps(res) + "\n")
    sys.stdout.flush()
