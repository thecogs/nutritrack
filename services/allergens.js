// Allergen definitions and keyword-matching check utility.
// offTags match against OpenFoodFacts allergens_tags (with 'en:' prefix stripped).
// keywords match against plain food name text as a fallback.

export const ALLERGENS = [
  { key: 'peanuts',   label: 'Peanuts',       offTags: ['peanuts'],                       keywords: ['peanut', 'groundnut', 'arachis'] },
  { key: 'tree_nuts', label: 'Tree Nuts',      offTags: ['nuts'],                          keywords: ['almond', 'cashew', 'walnut', 'pecan', 'pistachio', 'hazelnut', 'macadamia', 'brazil nut', 'pine nut', 'praline'] },
  { key: 'milk',      label: 'Milk / Dairy',   offTags: ['milk'],                          keywords: ['milk', 'dairy', 'cheese', 'butter', 'cream', 'yogurt', 'yoghurt', 'whey', 'casein', 'lactose', 'ghee', 'kefir'] },
  { key: 'eggs',      label: 'Eggs',           offTags: ['eggs'],                          keywords: ['egg', 'mayo', 'mayonnaise', 'meringue', 'albumin', 'omelette', 'omelet', 'quiche'] },
  { key: 'wheat',     label: 'Wheat / Gluten', offTags: ['gluten', 'wheat'],               keywords: ['wheat', 'gluten', 'bread', 'flour', 'pasta', 'noodle', 'barley', 'rye', 'semolina', 'spelt', 'farro', 'couscous', 'tortilla', 'bagel', 'muffin', 'cracker', 'cereal'] },
  { key: 'soy',       label: 'Soy',            offTags: ['soybeans'],                      keywords: ['soy', 'soya', 'tofu', 'edamame', 'miso', 'tempeh', 'natto'] },
  { key: 'fish',      label: 'Fish',           offTags: ['fish'],                          keywords: ['fish', 'salmon', 'tuna', 'cod', 'tilapia', 'bass', 'anchovy', 'sardine', 'halibut', 'trout', 'haddock', 'mahi', 'snapper', 'swordfish', 'herring'] },
  { key: 'shellfish', label: 'Shellfish',      offTags: ['crustaceans', 'molluscs'],       keywords: ['shrimp', 'crab', 'lobster', 'clam', 'oyster', 'scallop', 'mussel', 'prawn', 'crawfish', 'crayfish', 'octopus', 'squid', 'calamari'] },
  { key: 'sesame',    label: 'Sesame',         offTags: ['sesame-seeds'],                  keywords: ['sesame', 'tahini', 'hummus'] },
  { key: 'sulfites',  label: 'Sulfites',       offTags: ['sulphur-dioxide-and-sulphites'], keywords: ['sulfite', 'sulphite', 'sulphur dioxide', 'sulfur dioxide'] },
];

/**
 * Returns array of allergen labels that match the food.
 * @param {string}   foodName         - Plain text food name
 * @param {string[]} userAllergenKeys - Keys the user has flagged (e.g. ['milk','wheat'])
 * @param {string[]} offAllergenTags  - OpenFoodFacts allergens_tags array (e.g. ['en:milk','en:gluten'])
 */
export function checkAllergens(foodName, userAllergenKeys, offAllergenTags = []) {
  if (!userAllergenKeys || userAllergenKeys.length === 0) return [];
  const nameLower = (foodName || '').toLowerCase();
  const tagsLower = (offAllergenTags || []).map((t) => t.toLowerCase().replace('en:', ''));
  const found = [];
  for (const a of ALLERGENS) {
    if (!userAllergenKeys.includes(a.key)) continue;
    const inTags = a.offTags.some((tag) => tagsLower.some((t) => t.includes(tag)));
    const inName = a.keywords.some((kw) => nameLower.includes(kw));
    if (inTags || inName) found.push(a.label);
  }
  return found;
}
