import { Platform } from 'react-native';

const ANTHROPIC_API_KEY = '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';
const USDA_API_KEY      = 'DEMO_KEY';                     // swap for a real key at api.nal.usda.gov

// ── Helpers ──────────────────────────────────────────────────────────────────

function fetchWithTimeout(url, options = {}, ms = 12000) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...options, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

async function withRetry(fn, attempts = 2) {
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); } catch (e) {
      if (i === attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

function toTitleCase(str) {
  return (str || '').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Claude API wrapper ────────────────────────────────────────────────────────

async function claude(body, ms = 18000) {
  const isWeb = Platform.OS === 'web';
  const url     = isWeb ? '/api/proxy' : 'https://api.anthropic.com/v1/messages';
  const headers = { 'content-type': 'application/json' };
  if (!isWeb) {
    headers['x-api-key']         = ANTHROPIC_API_KEY;
    headers['anthropic-version'] = '2023-06-01';
  }
  const res  = await fetchWithTimeout(url, { method: 'POST', headers, body: JSON.stringify(body) }, ms);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Claude error ${res.status}`);
  return data.content?.[0]?.text ?? '';
}

function parseJSON(text) {
  const match = text.match(/\{[\s\S]*?\}/);
  if (!match) throw new Error('No JSON found in response');
  return JSON.parse(match[0]);
}

// ── USDA helpers ──────────────────────────────────────────────────────────────

function parseUsdaNutrients(foodNutrients) {
  const byId = {};
  const byName = {};
  (foodNutrients || []).forEach((n) => {
    if (n.nutrientId)   byId[n.nutrientId]                   = n.value ?? 0;
    if (n.nutrientName) byName[n.nutrientName.toLowerCase()] = n.value ?? 0;
  });
  return {
    calories: Math.round(byId[1008] || byName['energy'] || byName['energy (atwater general factors)'] || 0),
    protein:  parseFloat((byId[1003] || byName['protein'] || 0).toFixed(1)),
    carbs:    parseFloat((byId[1005] || byName['carbohydrate, by difference'] || byName['total carbohydrate'] || 0).toFixed(1)),
    fat:      parseFloat((byId[1004] || byName['total lipid (fat)'] || byName['total fat'] || 0).toFixed(1)),
    fiber:   parseFloat((byId[1079] || byName['fiber, total dietary'] || 0).toFixed(1)),
    sugar:   parseFloat((byId[2000] || byId[1063] || byName['total sugars'] || byName['sugars, total including nlea'] || byName['sugars, total'] || 0).toFixed(1)),
    sat_fat: parseFloat((byId[1258] || byName['fatty acids, total saturated'] || byName['saturated fat'] || 0).toFixed(1)),
  };
}

function offToFood(p) {
  const n = p.nutriments || {};
  const name = p.product_name_en || p.product_name;
  if (!name) return null;
  return {
    food_name:      name,
    brand:          p.brands || '',
    calories:       Math.round(n['energy-kcal_100g'] || n['energy-kcal'] || 0),
    protein:        parseFloat((n['proteins_100g']      || 0).toFixed(1)),
    carbs:          parseFloat((n['carbohydrates_100g'] || 0).toFixed(1)),
    fat:            parseFloat((n['fat_100g']           || 0).toFixed(1)),
    fiber:          parseFloat((n['fiber_100g'] || n['fibers_100g'] || 0).toFixed(1)),
    sugar:          parseFloat((n['sugars_100g'] || n['sugars-total_100g'] || 0).toFixed(1)),
    sat_fat:        parseFloat((n['saturated-fat_100g'] || 0).toFixed(1)),
    serving_size:   p.serving_size || '100g',
    allergens_tags: p.allergens_tags || [],
  };
}

// ── Barcode lookup ────────────────────────────────────────────────────────────

export async function lookupBarcode(barcode) {
  // 1. Open Food Facts (world)
  try {
    const res  = await fetchWithTimeout(
      `https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=product_name,product_name_en,brands,nutriments,serving_size,allergens_tags`,
      {}, 10000
    );
    const data = await res.json();
    if (data.status === 1) {
      const food = offToFood(data.product);
      if (food?.calories) return food;
    }
  } catch {}

  // 2. USDA Branded Foods by UPC
  try {
    const clean  = barcode.replace(/^0+/, '');
    const params = new URLSearchParams({ query: barcode, dataType: 'Branded Food', pageSize: '5', api_key: USDA_API_KEY });
    const res    = await fetchWithTimeout(`https://api.nal.usda.gov/fdc/v1/foods/search?${params}`, {}, 8000);
    const data   = await res.json();
    const match  = (data.foods || []).find((f) => {
      const g = (f.gtinUpc || '').replace(/^0+/, '');
      return g === clean || f.gtinUpc === barcode;
    });
    if (match) {
      const macros = parseUsdaNutrients(match.foodNutrients);
      if (macros.calories) {
        const desc = toTitleCase(match.description);
        return { food_name: match.brandOwner ? `${desc} — ${match.brandOwner}` : desc, brand: match.brandOwner || '', ...macros, serving_size: match.servingSize ? `${match.servingSize}${match.servingSizeUnit || 'g'}` : '100g' };
      }
    }
  } catch {}

  throw new Error('Product not found in any database');
}

// ── Food search (USDA + Open Food Facts) ─────────────────────────────────────

async function searchUSDA(q, dataType, size = 15) {
  const params = new URLSearchParams({ query: q, pageSize: String(size), dataType, api_key: USDA_API_KEY });
  const res    = await fetchWithTimeout(`https://api.nal.usda.gov/fdc/v1/foods/search?${params}`, {}, 8000);
  const data   = await res.json();
  return (data.foods || [])
    .map((f) => {
      const desc = toTitleCase(f.description);
      return {
        food_name: f.brandOwner ? `${desc} — ${f.brandOwner}` : desc,
        ...parseUsdaNutrients(f.foodNutrients),
        per100g: true,
      };
    })
    .filter((f) => f.calories > 0);
}

async function searchOFF(q) {
  const params = new URLSearchParams({ action: 'process', search_terms: q, json: '1', page_size: '10', sort_by: 'popularity', lc: 'en', cc: 'us', fields: 'product_name,product_name_en,brands,nutriments' });
  const res    = await fetchWithTimeout(`https://world.openfoodfacts.org/cgi/search.pl?${params}`, {}, 8000);
  const data   = await res.json();
  return (data.products || [])
    .filter((p) => (p.product_name_en || p.product_name) && p.nutriments?.['energy-kcal_100g'])
    .map((p) => {
      const n = p.nutriments;
      const name = p.product_name_en || p.product_name;
      return {
        food_name: p.brands ? `${name} — ${p.brands}` : name,
        calories:  Math.round(n['energy-kcal_100g']    || 0),
        protein:   parseFloat((n['proteins_100g']      || 0).toFixed(1)),
        carbs:     parseFloat((n['carbohydrates_100g'] || 0).toFixed(1)),
        fat:       parseFloat((n['fat_100g']           || 0).toFixed(1)),
        fiber:   parseFloat((n['fiber_100g'] || n['fibers_100g'] || 0).toFixed(1)),
        sugar:   parseFloat((n['sugars_100g'] || n['sugars-total_100g'] || 0).toFixed(1)),
        sat_fat: parseFloat((n['saturated-fat_100g'] || 0).toFixed(1)),
        per100g: true,
      };
    });
}

export async function searchWholeFoods(q) {
  try { return await searchUSDA(q, 'Foundation,SR Legacy', 20); } catch { return []; }
}

export async function searchFood(q) {
  if (!q || q.trim().length < 2) return [];
  const [whole, branded, off] = await Promise.allSettled([
    searchUSDA(q, 'Foundation,SR Legacy', 12),
    searchUSDA(q, 'Branded Food', 8),
    searchOFF(q),
  ]);
  const seen = new Set();
  return [
    ...(whole.value   || []),
    ...(branded.value || []),
    ...(off.value     || []),
  ].filter((item) => {
    const key = item.food_name.toLowerCase().slice(0, 32);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Claude vision — food photo ────────────────────────────────────────────────
// Step 1: Claude identifies food name + portion grams (+ reads label if present)
// Step 2: USDA lookup scaled to identified grams
// Step 3: Fall back to Claude's own macro estimates if USDA has no match

export async function scanFoodPhoto(base64Image, mimeType = 'image/jpeg') {
  return withRetry(async () => {
    const text = await claude({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64Image } },
          { type: 'text',  text:
            'You are a nutrition expert analyzing a food photo.\n' +
            '1. Identify the food as specifically as possible (e.g. "grilled chicken breast" not just "chicken").\n' +
            '2. Estimate the portion weight in grams using visual cues (plate, utensils, hand).\n' +
            '3. If this is a nutrition facts label, set is_label:true and read the values directly from the label.\n' +
            'Return ONLY valid JSON with no markdown:\n' +
            '{"food_name":"specific name","grams":number,"is_label":false,"calories":number,"protein":number,"carbs":number,"fat":number,"fiber":number,"sugar":number,"sat_fat":number}',
          },
        ],
      }],
    }, 20000);

    const identified = parseJSON(text);

    // Nutrition label photo → trust Claude's direct reading, it's accurate
    if (identified.is_label) {
      return { ...identified, source: 'label' };
    }

    // Try USDA with the identified food name, scaled to estimated portion
    try {
      const results = await searchWholeFoods(identified.food_name);
      if (results.length > 0) {
        const best  = results[0];
        const grams = identified.grams || 100;
        const scale = grams / 100;
        return {
          food_name:    identified.food_name,
          calories:     Math.round(best.calories * scale),
          protein:      Math.round(best.protein  * scale * 10) / 10,
          carbs:        Math.round(best.carbs    * scale * 10) / 10,
          fat:          Math.round(best.fat      * scale * 10) / 10,
          fiber:        Math.round((best.fiber || 0) * scale * 10) / 10,
          sugar:        Math.round((best.sugar   || 0) * scale * 10) / 10,
          sat_fat:      Math.round((best.sat_fat || 0) * scale * 10) / 10,
          serving_size: `${Math.round(grams)}g`,
          grams:        Math.round(grams),
          source:       'usda',
          _base:        best,   // per-100g values for re-scaling by portion chips
        };
      }
    } catch {}

    // Fall back to Claude's own macro estimates
    return { ...identified, source: 'ai' };
  });
}

// ── Smart describe: regex → USDA first, Claude fallback ──────────────────────

const UNIT_GRAMS = {
  g:1, gram:1, grams:1,
  oz:28.35, ounce:28.35, ounces:28.35,
  lb:453.6, lbs:453.6, pound:453.6, pounds:453.6,
  tbsp:15, tablespoon:15, tablespoons:15,
  tsp:5, teaspoon:5, teaspoons:5,
};

function parseQuantityText(text) {
  const t = text.toLowerCase().trim();
  const up = Object.keys(UNIT_GRAMS).join('|');
  // "{qty} {unit} {food}" — "200g chicken breast", "6 oz salmon"
  let m = t.match(new RegExp(`^([\\d./]+)\\s*(${up})\\.?\\s+(.+)$`));
  if (m) return { grams: (parseFloat(m[1]) || 1) * (UNIT_GRAMS[m[2]] || 1), food: m[3].trim() };
  // "{food} {qty}{unit}" — "chicken 200g", "salmon 6oz"
  m = t.match(new RegExp(`^(.+?)\\s+([\\d.]+)\\s*(${up})\\.?$`));
  if (m) return { grams: (parseFloat(m[2]) || 1) * (UNIT_GRAMS[m[3]] || 1), food: m[1].trim() };
  // No unit → plain food name, use 100g as base
  return { grams: 100, food: t };
}

export async function smartDescribeFoods(text) {
  const trimmed = text.trim();
  if (!trimmed) return describeFoods(text);
  try {
    const { grams, food } = parseQuantityText(trimmed);
    if (food.length >= 3) {
      // 1. Try Foundation/SR Legacy (most accurate macros for whole foods)
      let best = null;
      const wholeResults = await searchWholeFoods(food).catch(() => []);
      if (wholeResults.length > 0) best = wholeResults[0];

      // 2. If sugar missing (USDA search only returns ~25 nutrients — sugar often absent),
      //    try branded foods which always declare sugar on label
      if (!best || best.sugar === 0) {
        try {
          const branded = await searchUSDA(food, 'Branded Food', 5);
          const brandedWithSugar = branded.find((f) => f.sugar > 0);
          if (brandedWithSugar) {
            // Use whole-food macros if we have them, but take sugar from branded
            best = best
              ? { ...best, sugar: brandedWithSugar.sugar }
              : brandedWithSugar;
          }
        } catch {}
      }

      if (best) {
        const scale = grams / 100;
        return [{
          food_name: trimmed,
          calories:  Math.round(best.calories * scale),
          protein:   Math.round(best.protein  * scale * 10) / 10,
          carbs:     Math.round(best.carbs    * scale * 10) / 10,
          fat:       Math.round(best.fat      * scale * 10) / 10,
          fiber:     Math.round((best.fiber || 0) * scale * 10) / 10,
          sugar:   Math.round((best.sugar   || 0) * scale * 10) / 10,
          sat_fat: Math.round((best.sat_fat || 0) * scale * 10) / 10,
        }];
      }
    }
  } catch {}
  // Fall back to Claude for anything the DB can't handle
  return describeFoods(text);
}

// ── Claude text — natural language food description ───────────────────────────
// Returns an array of food objects. Single food → 1-element array.
// Multi-item descriptions ("mac and cheese and two hot dogs") → multiple elements.

export async function describeFoods(text) {
  return withRetry(async () => {
    const result = await claude({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{
        role:    'user',
        content:
          `You are a precise nutrition expert using USDA Foundation values.\n` +
          `The user ate: "${text}"\n\n` +
          `Identify EACH distinct food item and estimate macros for the exact quantity described.\n` +
          `Rules:\n` +
          `- One array entry per distinct food (e.g. mac and cheese + hot dogs → 2 entries)\n` +
          `- Respect quantities exactly: "half a box"=half package, "2 hot dogs"=2 individual hot dogs, "4oz"=113g\n` +
          `- For branded foods (Goodles, etc.) use actual product nutrition facts\n` +
          `- No quantity given → use a realistic single serving\n` +
          `- Whole foods → USDA Foundation values\n` +
          `- Include dietary fiber\n\n` +
          `Return ONLY a valid JSON array, no markdown:\n` +
          `[{"food_name":"concise name with quantity","calories":number,"protein":number,"carbs":number,"fat":number,"fiber":number,"sugar":number,"sat_fat":number}]`,
      }],
    }, 20000);

    // Try array first, fall back to wrapping a single object
    const arrMatch = result.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      const arr = JSON.parse(arrMatch[0]);
      if (Array.isArray(arr) && arr.length > 0) return arr;
    }
    const obj = parseJSON(result);
    return [obj];
  });
}

// ── Claude — nutrition advisor ────────────────────────────────────────────────

export async function getAdvice(messages, userGoals, todayLog) {
  const goals = userGoals || { calories: 2000, protein: 150, carbs: 250, fat: 65, fiber: 30 };
  const log   = todayLog  || [];

  const totals = log.reduce(
    (acc, item) => ({
      calories: acc.calories + (item.calories || 0),
      protein:  acc.protein  + (item.protein  || 0),
      carbs:    acc.carbs    + (item.carbs    || 0),
      fat:      acc.fat      + (item.fat      || 0),
      fiber:    acc.fiber    + (item.fiber    || 0),
      sugar:   acc.sugar   + (item.sugar   || 0),
      sat_fat: acc.sat_fat + (item.sat_fat || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sat_fat: 0 }
  );

  const system =
    `You are NutriTrack, a personal nutrition coach in a macro tracking iPhone app.\n\n` +
    `## Expertise\n` +
    `USDA Foundation food values, evidence-based macro guidance, practical whole-food meal planning, fiber optimization, calorie target calculation.\n\n` +
    `## Guidelines\n` +
    `- Protein: 0.7–1.0 g/lb bodyweight for active adults\n` +
    `- Fiber: 25–38 g/day; whole grains, legumes, vegetables, fruit\n` +
    `- Fat: minimum ~0.35 g/lb bodyweight for hormonal health\n` +
    `- Carbs: fill remaining calories after protein and fat\n\n` +
    `## Style\n` +
    `- 2–3 sentences unless a breakdown is explicitly requested\n` +
    `- Reference the user's actual logged numbers\n` +
    `- Suggest specific foods with portions ("6 oz chicken breast adds ~50 g protein")\n` +
    `- Be direct and encouraging — no filler phrases\n\n` +
    `## Updating goals\n` +
    `If the user explicitly asks you to update, change, or set their macro/calorie goals, apply sensible values and append EXACTLY this at the very end of your message (nothing after it):\n` +
    `GOALS_UPDATE:{"calories":N,"protein":N,"carbs":N,"fat":N,"fiber":N}\n` +
    `Use whole numbers. Only include this when actually changing goals.\n\n` +
    `## User's live data\n` +
    `Goals:     ${goals.calories} kcal | P ${goals.protein}g | C ${goals.carbs}g | Fat ${goals.fat}g | Fiber ${goals.fiber || 30}g | Sugar <${goals.sugar || 50}g | Sat.Fat <${goals.sat_fat || 20}g\n` +
    `Today:     ${Math.round(totals.calories)} kcal | P ${Math.round(totals.protein)}g | C ${Math.round(totals.carbs)}g | Fat ${Math.round(totals.fat)}g | Fiber ${Math.round(totals.fiber)}g | Sugar ${Math.round(totals.sugar)}g | Sat.Fat ${Math.round(totals.sat_fat || 0)}g\n` +
    `Remaining: ${Math.round(goals.calories - totals.calories)} kcal | P ${Math.round(goals.protein - totals.protein)}g remaining\n` +
    `Meals today: ${log.length ? log.map((m) => `${m.food_name} (${Math.round(m.calories)} kcal)`).join(', ') : 'none yet'}`;

  return withRetry(async () => {
    const reply = await claude({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system,
      messages:   messages.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
    }, 20000);
    if (!reply) throw new Error('Empty response from advisor');
    return { reply };
  });
}
