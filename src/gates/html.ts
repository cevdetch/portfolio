import { parse, type DefaultTreeAdapterTypes } from 'parse5';

type Node = DefaultTreeAdapterTypes.Node;
type Element = DefaultTreeAdapterTypes.Element;

function elements(node: Node): Element[] {
  if (!('childNodes' in node)) return [];
  return node.childNodes.flatMap(child => 'tagName' in child ? [child, ...elements(child)] : []);
}
const attr = (node: Element, name: string) => node.attrs.find(item => item.name === name)?.value;
const text = (node: Node): string => 'value' in node ? node.value : 'childNodes' in node ? node.childNodes.map(text).join('') : '';

const hidden = new Set(['script', 'style', 'template', 'head']);
function visible(node: Node): string[] {
  if ('tagName' in node && hidden.has(node.tagName)) return [];
  if (node.nodeName === '#text' && 'value' in node) return [node.value];
  return 'childNodes' in node ? node.childNodes.flatMap(visible) : [];
}

export function visibleText(html: string): string {
  return visible(parse(html)).join(' ').replace(/\s+/g, ' ').trim();
}

export function jsonLdBlocks(html: string): string[] {
  return elements(parse(html)).filter(node => node.tagName === 'script' && attr(node, 'type') === 'application/ld+json').map(text);
}

export function metaContents(html: string, name: string): string[] {
  return elements(parse(html)).filter(node => node.tagName === 'meta' && attr(node, 'name') === name).map(node => attr(node, 'content') ?? '');
}

export function hrefs(html: string): string[] {
  return elements(parse(html)).filter(node => node.tagName === 'a').flatMap(node => attr(node, 'href') ?? []);
}
