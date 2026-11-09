const placeholder = /\b(?:lorem|ipsum|todo|tbd|tbc|fixme|xxx|placeholder|coming soon)\b/i;
const version = /\bv?\d+\.\d+\.\d+\b/;
const firstPerson = /\bI\b/;
const pronoun = /\b(?:me|my|mine|we|our|ours|he|him|his|she|her|hers|they|them|their|theirs)\b/i;

export function lintText(where: string, text: string, cvShared: boolean): string[] {
  const problems: string[] = [];
  if (placeholder.test(text)) problems.push(`${where}: placeholder text`);
  if (version.test(text)) problems.push(`${where}: a version is a Fact; remove it from Story`);
  if (cvShared && (firstPerson.test(text) || pronoun.test(text))) problems.push(`${where}: CV-shared Story is verb-led and pronoun-free`);
  return problems;
}

export const caseStudySections = ['Problem', 'Constraints', 'Decisions', 'Results', 'Next'] as const;

export function caseStudyHeadings(body: string): string[] {
  const prose = body.replace(/^(```|~~~)[\s\S]*?^\1[^\n]*$/gm, '');
  return [...prose.matchAll(/^##[ \t]+(.+?)[ \t]*#*[ \t]*$/gm)].map(match => match[1]!);
}
