# CoopPoker

Bot Discord de poker coopératif. Chacun reçoit 2 cartes. À chaque tour (pré-flop, flop, turn, river), les joueurs prennent une position de 1 (meilleure main) à n (la pire), en discutant et en se piquant les positions. Après la river, tout le monde gagne si le classement final est parfait. Les ex-aequo peuvent se répartir leurs places dans n'importe quel ordre.

## Utilisation

- `/poker create` : ouvre une table dans le salon. Les autres cliquent sur **Rejoindre**, puis **Lancer**.
- **🂠 Mes cartes** : affiche tes 2 cartes dans un message caché, visible par toi seul. Un clic par manche suffit.
- **1..n** : prend une position, même si elle est déjà prise. Re-cliquer sur la sienne la rend.
- **🔒 Bloquer ma position** : retourne ton jeton, définitivement jusqu'au tour suivant. Plus personne ne peut te le voler, et tu ne peux plus en changer.
- **Couleurs des positions** : bleu = libre, vert = prise, gris désactivé = bloquée. Dans l'historique, ● = libre et ○ = bloquée.
- **Tour suivant** : actif quand tout le monde est placé.
- `/poker table` : réaffiche la table. `/poker stop` : arrête la partie et ferme la table.

Chaque manche occupe 2 messages. En haut, les infos de la manche : règles, n° de manche, score, et un bouton pour le détail des combinaisons (réponse privée). En dessous, la table, modifiée sur place : tableau, historique de la manche, puis résultat. À la manche suivante, ces 2 messages restent et 2 nouveaux sont postés en dessous, pour pouvoir remonter les manches précédentes.

Les parties sont gardées en mémoire : un redémarrage du bot les efface.

## Inviter le bot sur un serveur

👉 [Ajouter CoopPoker à un serveur](https://discord.com/oauth2/authorize?client_id=1572236813710663812&permissions=19456&integration_type=0&scope=bot+applications.commands)

Le bot demande seulement les permissions `View Channels`, `Send Messages` et `Embed Links`.

## Bonus et malus

Une manche gagnée donne un **malus** pour la suivante, une manche perdue donne un **bonus**. L'effet est tiré au hasard et affiché dans le message d'infos de la manche. La toute première manche n'en a pas.

- **Mode normal** : un seul effet, qui ne dure qu'une manche.
- **🌀 Mode chaos** (bouton à bascule dans le salon d'attente et sur le résultat de manche) : les effets s'accumulent. Une victoire retire le plus vieux bonus s'il y en a un, et ajoute un malus. Une défaite retire le plus vieux malus et ajoute un bonus. Par exemple, 3 victoires d'affilée donnent 3 malus, et une défaite derrière laisse 2 malus et 1 bonus.

Le même effet n'est jamais actif deux fois. Si tous ceux d'une sorte le sont déjà, rien ne s'ajoute.

### 😈 Malus

| | Malus | Effet |
|---|---|---|
| 🔓 | Pas de blocage | Impossible de bloquer sa position. |
| ⏭️ | Pas de pré-flop | La manche commence directement au flop. |
| 🙈 | Historique masqué | Les positions des tours précédents restent cachées jusqu'au résultat. |
| ⏱️ | Chrono | 20 s par joueur et par tour, avec un compte à rebours sur la table. Au bout du temps, ceux qui ne sont pas placés prennent les positions restantes et le tour passe. |
| 🂠 | Carte cachée | La 1re carte du flop reste face cachée jusqu'à la river. |
| 🚫 | Pas de vol | On ne prend qu'une position libre. Pour récupérer une position occupée, son titulaire doit d'abord la rendre en recliquant dessus. |
| ⏭️ | Pas de turn | Pas de classement à la turn : la turn et la river sortent ensemble, puis on fait le dernier classement. Avec ⏭️ Pas de pré-flop, il ne reste que le flop et la river. |
| 🌊 | Rivière agitée | À la river, juste avant le dernier classement, une des 4 premières cartes du tableau est tirée au hasard et remplacée par une nouvelle carte du paquet. Le bot annonce laquelle. Avec 🂠 Carte cachée, la carte cachée peut être tirée. |
| 👻 | Joueur fantôme | Un 👻 Fantôme reçoit 2 cartes cachées. Il y a n+1 positions pour n joueurs : celle qui reste vide est celle du Fantôme, et pour gagner elle doit aussi être à sa vraie place. Ses cartes sont montrées au résultat. Il compte dans les annonces des bonus (⛰️ ⚓ 🔭 🎯 🧭) et on peut l'espionner. |
| ⬆️ | Tête verrouillée | Qui prend la position 1 y est bloqué jusqu'au tour suivant, comme avec 🔒. Si c'est aussi le 1er jeton du tour avec 🥇 Premier verrouillé, ce dernier est consommé quand même. |
| ⬇️ | Queue verrouillée | Pareil pour la dernière position (n+1 avec 👻 Joueur fantôme). Cumulable avec ⬆️ Tête verrouillée. |
| 🔺 | Main haute instable | Si au moins un habillé (valet, dame, roi) est sorti au tableau quand la turn tombe, le 1er du classement du flop reçoit 2 nouvelles cartes. Ses anciennes cartes sont défaussées et montrées à la table. La carte cachée de 🂠 Carte cachée ne compte pas. |
| 🔻 | Main basse instable | L'inverse : si aucun habillé n'est sorti au tableau quand la turn tombe, c'est le dernier joueur du classement du flop qui reçoit 2 nouvelles cartes, les anciennes étant montrées à la table. |
| 👑 | Lourde est la couronne | Le 1er du premier tour joué (pré-flop, ou flop sans pré-flop) devient le roi. Il ne fait plus rien lui-même : il ne peut plus se placer, se bloquer, passer le tour, utiliser de bonus ni ouvrir 🏆 Détails des combinaisons, et « Mes cartes » ne lui montre plus rien. Ses sujets le placent pour lui avec le bouton 👑 Placer le roi (personne ne peut le bloquer volontairement), en l'appelant « mon roi ». Sur l'honneur, il ne regarde plus la table (le bot ne peut pas la lui cacher). Avec 👻 Joueur fantôme, si le trou est en tête, c'est le mieux placé qui est couronné. |
| ☝️ | Main de borgne | Un joueur tiré au hasard ne voit qu'une de ses 2 cartes (de dos dans 🂠 Mes cartes) de toute la manche : elle n'est montrée qu'au résultat. La table sait qui c'est. |
| 🥇 | Premier verrouillé | À chaque tour, le premier qui prend une position est bloqué dessus jusqu'au tour suivant, comme avec 🔒. Marche aussi avec 🔓 Pas de blocage, qui n'interdit que les blocages volontaires. |

### 😇 Bonus

| | Bonus | Effet |
|---|---|---|
| 🔄 | Échange | Le premier qui clique remplace une de ses deux cartes par une carte du paquet. L'ancienne carte est défaussée et montrée à toute la table. |
| 👁️ | Révélation | Le premier qui clique montre une de ses cartes à toute la table. |
| 🔭 | Longue-vue | Une fois, le bot annonce la plus haute combinaison parmi toutes les mains, avec le tableau du moment (au pré-flop : paire ou carte haute). |
| 🎯 | Mastermind | Une fois, à partir du flop, quand tout le monde est placé, le bot dit combien de joueurs sont bien placés avec le tableau du moment, sans dire lesquels. Les ex-aequo sont bien placés n'importe où dans leur plage de places. |
| 🧭 | Boussole | Une fois, à partir du flop, on choisit un joueur placé et le bot dit à la table s'il est bien ou mal placé avec le tableau du moment (même règle d'égalité que 🎯 Mastermind). |
| 🕵️ | Espion | Le premier qui clique choisit un autre joueur : une de ses cartes, tirée au hasard, est montrée à toute la table. |
| 🏮 | Lanterne rouge | Une fois, à partir du flop, le bot dit qui a la pire main avec le tableau du moment (tous les ex-aequo s'il y en a, 👻 Fantôme compris). |
| 🧮 | Recensement | Une fois, on choisit une valeur (2 à As) et le bot dit à la table combien de cartes de cette valeur sont encore dans la pioche. |
| ⚔️ | Duel | Une fois, à partir du flop, on choisit deux joueurs (👻 Fantôme compris) et le bot dit à la table lequel est devant avec le tableau du moment, ou s'ils sont à égalité. |
| 🍀 | Seconde chance | À la fin, une seule inversion entre deux joueurs voisins est pardonnée. |
| ⛰️ | Montagne | Une fois, le bot annonce la plus haute carte en main, valeur seulement, sans dire qui l'a. |
| ⚓ | Fond de cale | Une fois, le bot annonce la plus basse carte en main, valeur seulement, sans dire qui l'a. |
| ☠️ | Cartes mortes | Une fois, le bot brûle 4 cartes du paquet et les montre à la table. Elles ne sont dans aucune main et ne sortiront pas au tableau. |

Les bonus à utiliser apparaissent comme boutons sous la table, et ce qu'ils ont révélé reste affiché sur la table jusqu'à la fin de la manche.

## Le bot Discord

L'appli existe déjà : son Application ID `1572236813710663812` est pré-rempli dans `.env.example`.

Le token se trouve sur le portail [Discord Developer Portal](https://discord.com/developers/applications), onglet **Bot**, bouton **Reset Token**. Il ne va **que** dans le `.env`, jamais dans le dépôt. Aucun intent privilégié n'est nécessaire.

## En local

```sh
npm install
cp .env.example .env    # puis remplis les valeurs
npm run build
npm run deploy-commands # à refaire seulement si les commandes changent
npm run dev             # ou npm start
```

`npm test` lance les tests du moteur de jeu.

## Sur le Raspberry Pi

Le bot ouvre lui-même une connexion sortante vers Discord : pas de port à ouvrir sur la box.

```sh
# Node 22+ (via nvm ou NodeSource), puis :
sudo npm install -g pm2 # sans sudo si Node vient de nvm
git clone <repo> coop-poker && cd coop-poker
npm install
cp .env.example .env    # puis remplis les valeurs
npm run build
npm run deploy-commands
pm2 start ecosystem.config.cjs
pm2 startup             # suit la commande affichée, pour relancer au boot
pm2 save
```

Mise à jour : `git pull && npm install && npm run build && pm2 restart coop-poker`

Logs : `pm2 logs coop-poker`
