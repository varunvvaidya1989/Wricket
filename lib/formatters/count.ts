export function formatCount(
  count: number,
  singular: string,
  plural = pluralize(singular),
): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function pluralize(value: string): string {
  if (/(s|x|z|ch|sh)$/i.test(value)) return `${value}es`;
  if (/[^aeiou]y$/i.test(value)) return `${value.slice(0, -1)}ies`;
  return `${value}s`;
}
