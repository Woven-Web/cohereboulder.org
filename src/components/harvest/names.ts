/** "Honoring Water | with Angelique" → "Honoring Water". */
export const shortName = (name: string) => name.split(/ \| | -- | — /)[0].trim() || name;
