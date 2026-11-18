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
| 🥇 | Premier verrouillé | À chaque tour, le premier qui prend une position est bloqué dessus jusqu'au tour suivant, comme avec 🔒. Marche aussi avec 🔓 Pas de blocage, qui n'interdit que les blocages volontaires. |

### 😇 Bonus

| | Bonus | Effet |
|---|---|---|
| 🔄 | Échange | Le premier qui clique remplace une de ses deux cartes par une carte du paquet. |
| 👁️ | Révélation | Le premier qui clique montre une de ses cartes à toute la table. |
| 🔭 | Longue-vue | Une fois, le bot annonce la plus haute combinaison parmi toutes les mains, avec le tableau du moment (au pré-flop : paire ou carte haute). |
| 🎯 | Mastermind | Une fois, à partir du flop, quand tout le monde est placé, le bot dit combien de joueurs sont bien placés avec le tableau du moment, sans dire lesquels. Les ex-aequo sont bien placés n'importe où dans leur plage de places. |
| 🧭 | Boussole | Une fois, à partir du flop, on choisit un joueur placé et le bot dit à la table s'il est bien ou mal placé avec le tableau du moment (même règle d'égalité que 🎯 Mastermind). |
| 🕵️ | Espion | Le premier qui clique choisit un autre joueur : une de ses cartes, tirée au hasard, est montrée à toute la table. |
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
