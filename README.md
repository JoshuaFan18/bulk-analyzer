# Riftbound Manager

Riftbound Manager is a collection manager, a bulk analyzer and a deck builder for
the Riftbound TCG. It is a local app for one user.

The client is React (Vite). The server is Express. All data is JSON files in
`data/`. There is no database and there are no accounts. The server gets the card
data from the DotGG API and the meta data from riftdecks.com. No other data goes
out of your machine.

## Start the app

```bash
npm install
npm run dev
```

Then open http://localhost:5173. Express listens on port 5175.

For one server, do `npm run build`, then `npm start`. This serves the app on
http://localhost:5175.

### Windows one-click start

`run-riftbound.bat` starts the one-server mode and opens the browser. Double-click
it, or make a desktop shortcut to it. The first run installs the dependencies and
builds the app if either is not there. The command window is the server; close it
to stop the app. After a code change, do `npm run build` one time, because this
mode serves the built `dist/` and not the live dev server.

## Pages

**Collection** shows all 1383 printings. Set the number of normal copies and foil
copies for each printing. Use the filters for the set, the domain, the energy
cost, the power cost, the might, the type, the rarity, the keyword and the tag.
Rapid entry lets you type collector numbers quickly, and a switch flips it
between two screens. The Pack screen adds the cards from one set, which you pick
in a menu. The Trade screen has two boxes: one box for the cards you give and one
box for the cards you get. On the Trade screen you type the full card id, because
the set is not put in for you. Either box can stay empty. Import accepts a DotGG
CSV file, a Legacy CSV file or a TCGplayer CSV file. Push "Update prices" to get
new prices.

**Surplus** shows the copies that no deck can play. The deck limit is 3 copies,
but 12 for a Rune and 1 for a Legend and a Battlefield. The copies fold across
the printings. The page assumes that you keep the most expensive copies.

**True Bulk Analyzer** finds the cards that you can sell in bulk. A card is true
bulk when all of these conditions are true:

- The rarity is Common or Uncommon. The card is not a Rune and not a token.
- The card does not have the `Keep` tag.
- You own a minimum of one **normal** copy. A foil is never bulk.
- The normal price is less than the price limit ($0.20).
- The maximum play rate across the meta legends is not more than the play-rate
  limit (10%).
- The maximum popularity across the field is not more than (10%)

The page also shows the cards that the meta protects, the cards above the price
limit and the cards that the `Keep` tag holds back. A card with no price stays out
of the bulk list.

**Deck Builder** makes a deck of 1 Legend, 1 Chosen Champion, 3 Battlefields, 12
Runes, 40 main cards and a maximum of 10 sideboard cards. The bench holds the
cards that you plan to add. The legend controls the legality: each card must be in
the two domains of the legend, a signature card needs the legend of its champion,
and the deck holds a maximum of 3 signature cards. 13 cards are banned. The pool
shows one printing for each card, but ownership folds across all the printings.

**My Decks** lists the saved decks with the price and the missing copies.

**Deck Viewer** shows a saved deck with the card images, the statistics and the
cards that you must still get.

**Config** imports the power costs. The DotGG feed gives only the energy cost, thus
the app gets the power cost from api.riftcodex.com. The button sends only the
cards that have no power cost.

## Data files

| File | Contents |
| --- | --- |
| `data/cards.json` | The card data and the prices |
| `data/collection.json` | Your copies of each printing |
| `data/wishlist.json` | The cards that you want |
| `data/tags.json` | Your custom tags, which include `Keep` |
| `data/power.json` | The power costs that the Config page imports |
| `data/decks/*.json` | The saved decks |
| `data/meta-cache/*.json` | The riftdecks.com data in the cache |

The folder is `data/` in the repo. The `DATA_DIR` environment variable moves it to a
different disk. See "Two PCs".

## Two PCs

Keep one data folder on a USB drive, and keep the code on each PC. The data is
approximately 80 KB, thus a small drive is sufficient. `cards.json` and `meta-cache/` go
to the drive also, and the two PCs then share the prices.

1. Connect the drive on PC 1. Make a folder on it, for example `E:\riftbound-data`.
2. Move the contents of `data/` into that folder.
3. In the repo on PC 1, make a file `data-dir.txt`. Put the full path of the folder in
   it, on one line, and with no quotation marks. This file is not in git, because the
   drive letter can be different on each PC.
4. Do step 3 again on PC 2, with the drive letter of PC 2.
5. Start the app with `run-riftbound.bat`. The window shows "Data folder:" and the path.
   Make sure that it is the path on the drive.

Rules:

- Use one PC at a time. The app saves 600 ms after each change, thus two servers on the
  same folder can write over each other.
- Close the app before you disconnect the drive.
- If the drive is not connected, the app **does not start**. It shows the path and
  stops. This is correct, because it prevents an empty collection and a second set of
  files on the local disk.
- For `npm run dev`, set the variable in the shell first:
  `set DATA_DIR=E:\riftbound-data` in cmd, or
  `$env:DATA_DIR = "E:\riftbound-data"` in PowerShell.
- Make a copy of the folder from time to time. A USB drive can fail.
