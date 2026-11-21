// Build-only artwork: the social card as the site's station header, in the light scheme. A brand band across the
// top, the --brand-bg field, the page's title large in Archivo, the name and role line, and the mark at the right
// with its gold block. Every colour is read from the site's own tokens and the mark from the installed icon.
export interface CardNode {
  type: 'div' | 'img';
  key: null;
  props: {
    style: Readonly<Record<string, string | number>>;
    children?: string | CardNode | readonly CardNode[];
    src?: string;
    width?: number;
    height?: number;
  };
}

/** The light-scheme tokens the card paints with. */
export interface CardPalette { text: string; brand: string; brandInk: string; brandBg: string; cta: string }
export interface CardBrand { name: string; role: string; palette: CardPalette; mark: { body: string; odd: string } }

/** The custom properties of the first `:root` block of a token file: its light scheme. */
export function lightTokens(css: string): Record<string, string> {
  const block = /:root\s*\{([^}]*)\}/.exec(css)?.[1];
  if (!block) throw new Error('No :root block in the token file.');
  return Object.fromEntries([...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [name!, value!.trim()]));
}

/** The card's palette from the neutrals in tokens.css and the brand slots in the generated brand.css. */
export function cardPalette(neutralsCss: string, brandCss: string): CardPalette {
  const tokens = { ...lightTokens(neutralsCss), ...lightTokens(brandCss) };
  const pick = (name: string) => {
    const value = tokens[name];
    if (!value) throw new Error(`The token files define no ${name}.`);
    return value;
  };
  return { text: pick('--text'), brand: pick('--brand'), brandInk: pick('--brand-ink'), brandBg: pick('--brand-bg'), cta: pick('--cta') };
}

/** The mark's two paths, the six-block body and the odd block, read from the installed icon. */
export function markPaths(iconSvg: string): CardBrand['mark'] {
  const paths = [...iconSvg.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)].map(match => match[1]!);
  if (paths.length !== 2) throw new Error(`The icon has ${paths.length} paths; the mark needs the body and the odd block.`);
  return { body: paths[0]!, odd: paths[1]! };
}

/** A page title is "<page> - <name>", and the home's "<name> - <role>": the card states the page, then who. */
export function cardText(title: string, brand: Pick<CardBrand, 'name' | 'role'>): { heading: string; line: string } {
  if (title.startsWith(`${brand.name} - `)) return { heading: brand.name, line: brand.role };
  const suffix = ` - ${brand.name}`;
  return { heading: title.endsWith(suffix) ? title.slice(0, -suffix.length) : title, line: `${brand.name} · ${brand.role}` };
}

const node = (style: CardNode['props']['style'], children?: CardNode['props']['children']): CardNode =>
  ({ type: 'div', key: null, props: children === undefined ? { style } : { style, children } });

export function createCard(title: string, brand: CardBrand): CardNode {
  const { palette, mark } = brand;
  const { heading, line } = cardText(title, brand);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="${palette.brand}" d="${mark.body}"/><path fill="${palette.cta}" d="${mark.odd}"/></svg>`;
  return node({ display: 'flex', flexDirection: 'column', width: 1200, height: 630, backgroundColor: palette.brandBg }, [
    node({ display: 'flex', height: 12, backgroundColor: palette.brand }),
    node({ display: 'flex', flexGrow: 1, alignItems: 'center', justifyContent: 'space-between', gap: 64, padding: '64px 80px' }, [
      node({ display: 'flex', flexDirection: 'column', flexGrow: 1, flexShrink: 1, gap: 32 }, [
        node({
          display: 'block', fontFamily: 'Archivo Title', fontWeight: 800, fontSize: 112, lineHeight: 1, letterSpacing: -2.2,
          color: palette.text, lineClamp: 3, wordBreak: 'break-word', textOverflow: 'ellipsis', overflow: 'hidden',
        }, heading),
        node({ display: 'flex', fontFamily: 'Archivo', fontWeight: 600, fontSize: 36, lineHeight: 1.2, color: palette.brandInk }, line),
      ]),
      { type: 'img', key: null, props: { src: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`, width: 240, height: 240, style: { flexShrink: 0 } } },
    ]),
  ]);
}
