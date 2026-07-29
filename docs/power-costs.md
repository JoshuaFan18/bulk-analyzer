# Power costs

Read this before you edit [server/power.js](../server/power.js), the power baseline or the
**Import Power** flow. See also [CLAUDE.md](../CLAUDE.md) for the always-true core.

The DotGG API has no **power** stat, and its `cost` is the *energy* (generic) cost. `state.jsx`
adds `card.power` from the committed baseline
[client/src/data/powerCosts.json](../client/src/data/powerCosts.json), then from the runtime overlay
`data/power.json`. **The baseline wins**, thus an import cannot change a known value. The values
fold across the printings by `cardIdentity`.

- Power is **null** for a card with no power concept. `hasPowerConcept` in
  [server/power.js](../server/power.js) needs a `cost` that is not null and refuses a token. Thus the
  Legends, the Battlefields, the Runes and the double-faced tokens have no power.
- The source is the keyless `api.riftcodex.com/cards`. Take **only `power`** from it, because it
  has no prices and cannot replace DotGG.
- The fetch and the join are in [server/power.js](../server/power.js), and the two writers use this
  same code: `node scripts/build-power-costs.mjs` writes the baseline after a new set, and `POST
  /api/power/import` (the **Import Power** button on the Config page) writes the missing values
  into `data/power.json`. The button sends only the ids that are null.
- The baseline is in git, because the client `import`s it at the build and nothing makes it again.
- `state.jsx` gets `GET /api/power` with a `.catch` fallback, because an Express process from
  before these routes sends a 404. **Restart Express** after you pull this change.
