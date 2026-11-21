import satori from 'satori';
import sharp from 'sharp';
import type { Direction } from './seo.ts';
import { createCard, type CardBrand } from './social-card.ts';

export interface SocialRenderInput {
  pageUrl: string;
  title: string;
  description: string;
  lang: string;
  dir?: Direction;
}
export interface SocialRenderer { render(input: SocialRenderInput): Promise<Uint8Array> }
/** The card's two static faces: the title's semi-condensed extra bold and the line's semibold. */
export interface CardFonts { title: Uint8Array; line: Uint8Array }

export async function createRenderer(fonts: CardFonts, brand: CardBrand): Promise<SocialRenderer> {
  const title = Buffer.from(fonts.title), line = Buffer.from(fonts.line);
  return {
    async render(input) {
      const remedy = `${input.pageUrl}: cannot render the title card. Use a tested local font, a manual image or image=false.`;
      try {
        if (input.dir === 'rtl' || /[\u0590-\u08ff\u200f\u202b\u202e\u2067-\u2069\ufb1d-\ufdff\ufe70-\ufeff]/u.test(input.title)) {
          throw new Error('RTL card shaping has not been verified.');
        }
        const svg = await satori(createCard(input.title, brand), {
          width: 1200, height: 630,
          fonts: [
            { name: 'Archivo Title', data: title, weight: 800, style: 'normal' },
            { name: 'Archivo', data: line, weight: 600, style: 'normal' },
          ],
          loadAdditionalAsset: async (_code, text) => { throw new Error(`The local font cannot render ${JSON.stringify(text)}.`); },
        });
        const bytes = await sharp(Buffer.from(svg)).png().toBuffer();
        const { info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
        if (info.width !== 1200 || info.height !== 630) throw new Error('Expected a 1200x630 PNG.');
        return bytes;
      } catch (cause) {
        throw new Error(remedy, { cause });
      }
    },
  };
}
