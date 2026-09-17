function normalize(text: string) {
  return text.replace(/[\s\p{P}\p{S}]/gu, "");
}

export function polishSimilarity(original: string, suggestion: string) {
  const left = normalize(original);
  const right = normalize(suggestion);
  if (left === right) return 1;
  const shingles = (text: string) => {
    const values = new Set<string>();
    for (let i = 0; i <= text.length - 3; i++) values.add(text.slice(i, i + 3));
    return values;
  };
  const a = shingles(left);
  const b = shingles(right);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const value of a) if (b.has(value)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

export function isSubstantivePolish(original: string, suggestion: string) {
  const left = normalize(original);
  const right = normalize(suggestion);
  if (!left || !right || left === right) return false;
  if (left.length < 80) return true;
  return polishSimilarity(original, suggestion) <= 0.82;
}
