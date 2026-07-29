# Components and page shell

Read this before you edit the shared components, the page shell or the domain-art assets. See also
[CLAUDE.md](../CLAUDE.md) for the always-true core.

- [client/src/components/CardDetailModal.jsx](../client/src/components/CardDetailModal.jsx) is the
  full-card popup. It is **read-only** and must not change a deck or the collection. The two call
  sites keep the card **id** and not the card, thus an open popup shows the new price after a
  refresh. On the tile, the star and the lock stay **outside** the art button.
- The pages in [client/src/pages/](../client/src/pages/) keep their own UI state and filters, and
  [client/src/styles.css](../client/src/styles.css) is one global stylesheet. The sort on the deck
  panel puts a card with no value for the key **last in the two directions**, and not at zero.

## Domain art

The card images come from the DotGG CDN through `card.image`, and the app has no local copies. The
**domain art is the exception**. [icons/](../icons/) has the 1000×1000 originals, which are outside
the Vite root and cannot be imported. `scripts/resize-icons.ps1` makes the 14 small files in
`client/src/assets/icons/`, and all imports point there. **To add an icon, add it in the two
directories.** [vite.config.js](../vite.config.js) removes that directory from the inline rule, thus
the browser keeps the files in its cache. There is no `client/public/`.
