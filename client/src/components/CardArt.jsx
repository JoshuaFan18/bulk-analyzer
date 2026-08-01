// Rules: docs/components.md
import React, { useCallback, useState } from 'react';

// The one card image of the app. Every render site uses it.
//
// The DotGG CDN does not send the battlefields in one orientation: 67 of the 71
// files are landscape, and 4 of them (VEN-158, VEN-161, VEN-163, VEN-164) are
// portrait with the art turned counter-clockwise. Each site gives the image a
// 5:7 portrait slot, thus a landscape file shows only its middle strip and the
// four portrait files show the art on its side.
//
// Thus a landscape battlefield gets a quarter turn counter-clockwise (the
// `turned` class, in styles.css), which makes it portrait like the four CDN
// files and like all other cards. The turn comes from a MEASUREMENT of the
// loaded file and not from a list of ids, thus the app stays correct if DotGG
// repairs or adds a file. Do not remove the measurement.
export default function CardArt({ card, className = '', ...rest }) {
  // Keep the source with the measurement: a tile that changes to a different
  // card must not keep the turn of the card before it.
  const [seen, setSeen] = useState(null);

  const measure = useCallback((img) => {
    if (!img || !img.naturalWidth) return;
    setSeen({ src: img.getAttribute('src'), wide: img.naturalWidth > img.naturalHeight });
  }, []);

  const turned = card?.type === 'Battlefield' && seen?.src === card?.image && seen.wide;

  return (
    <img
      // A cached image can be `complete` before React attaches onLoad, and then
      // onLoad never fires. Thus the ref measures as well.
      ref={measure}
      className={`card-art${turned ? ' turned' : ''}${className ? ` ${className}` : ''}`}
      src={card?.image}
      alt={card?.name || ''}
      loading="lazy"
      decoding="async"
      onLoad={(e) => measure(e.currentTarget)}
      {...rest}
    />
  );
}
