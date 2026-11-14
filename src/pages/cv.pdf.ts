import type { APIRoute } from 'astro';
import { resolve } from 'node:path';
import { buildCv } from '../cv/model.ts';
import { placePhoto, renderCvPdf } from '../cv/render.ts';
import { cvPortraitPath } from '../data/portrait.ts';
import { loadPortfolio } from '../data/portfolio.ts';

// The build also leaves .astro/cv/cv.yaml, the public model that pnpm cv:private renders with private fields.
export const GET: APIRoute = async () => {
  const workDir = resolve('.astro/cv');
  const photo = await placePhoto(resolve(cvPortraitPath), workDir);
  const pdf = await renderCvPdf(buildCv(await loadPortfolio(), photo), {
    workDir, design: resolve('cv/design.yaml'), output: resolve(workDir, 'cv.pdf'),
  });
  return new Response(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf' } });
};
