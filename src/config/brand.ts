import { readFileSync } from 'node:fs';

/** Legacy demo fixture defaults only; reusable renderers receive structured seller input. Keep logo assets local for offline previews. */
export const brand = {
  seller: { name: 'Fennquill Systems', email: 'sales@example.com', description: 'Fictional demonstration company. All customers, products and prices are fictional. For demonstration only.' },
  tagline: 'A CLEARER WAY TO WORK',
  logo: { src: `data:image/png;base64,${readFileSync(new URL('../rendering/assets/leaf.png', import.meta.url)).toString('base64')}`, alt: 'Leaf brand mark' },
  colors: { ink: '#092238', muted: '#475569', accent: '#00636B', soft: '#EAF2F0', white: '#FFFFFF', canvas: '#F3F5F5', border: '#D3DEDF', dark: '#003D43' },
};
