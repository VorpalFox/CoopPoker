# CoopPoker

Bot Discord de poker coopératif. Chacun reçoit 2 cartes. À chaque tour (pré-flop, flop, turn, river), les joueurs prennent une position de 1 (meilleure main) à n (la pire), en discutant et en se piquant les positions. Après la river, tout le monde gagne si le classement final est parfait. Les ex-aequo peuvent se répartir leurs places dans n'importe quel ordre.

## Utilisation

- `/poker creer` : ouvre une table dans le salon. Les autres cliquent sur **Rejoindre**, puis **Lancer**.
- **🂠 Mes cartes** : affiche tes cartes en privé, avec ta meilleure main dès le flop.
- **1..n** : prend une position, même si elle est déjà prise. Re-cliquer sur la sienne la rend.
- **🔒 Bloquer / débloquer ma position** : retourne ton jeton. Plus personne ne peut te le voler, et tu ne peux plus en changer avant de le débloquer. À l'écran, ⚪ = libre et ⚫ = bloqué, y compris dans l'historique.
- **Tour suivant** : actif quand tout le monde est placé. La table est alors repostée en bas du salon.
- `/poker table` : réaffiche la table. `/poker stop` : ferme la table.

Les parties sont gardées en mémoire : un redémarrage du bot les efface.

## Créer le bot Discord

1. Sur https://discord.com/developers/applications, clique sur **New Application**.
2. Onglet **Bot** : **Reset Token**, puis copie le token dans `DISCORD_TOKEN`. Aucun intent privilégié n'est nécessaire.
3. Onglet **General Information** : copie l'**Application ID** dans `DISCORD_CLIENT_ID`.
4. Onglet **OAuth2 > URL Generator** : coche les scopes `bot` et `applications.commands`, et les permissions `View Channels`, `Send Messages` et `Embed Links`. Ouvre l'URL générée pour inviter le bot sur ton serveur.

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
npm install -g pm2
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
