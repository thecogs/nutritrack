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
    fiber:    parseFloat((byId[1079] || byName['fiber, total dietary'] || 0).toFixed(1)),
  };
}

function offToFood(p) {
  const n = p.nutriments || {};
  const name = p.product_name_en || p.product_name;
  if (!name) return null;
  return {
    food_name:    name,
    brand:        p.brands || '',
    calories:     Math.round(n['energy-kcal_100g'] || n['energy-kcal'] || 0),
    protein:      parseFloat((n['proteins_100g']      || 0).toFixed(1)),
    carbs:        parseFloat((n['carbohydrates_100g'] || 0).toFixed(1)),
    fat:          parseFloat((n['fat_100g']           || 0).toFixed(1)),
    fiber:        parseFloat((n['fiber_100g'] || n['fibers_100g'] || 0).toFixed(1)),
    serving_size: p.serving_size || '100g',
  };
}

// ── Barcode lookup ────────────────────────────────────────────────────────────

export async function lookupBarcode(barcode) {
  // 1. Open Food Facts (world)
  try {
    const res  = await fetchWithTimeout(
      `https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=product_name,product_name_en,brands,nutriments,serving_size`,
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
        fiber:     parseFloat((n['fiber_100g'] || n['fibers_100g'] || 0).toFixed(1)),
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

export async function scanFoodPhoto(base64Image, mimeType = 'image/jpeg') {
  return withRetry(async () => {
    const text = await claude({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64Image } },
          { type: 'text',  text: 'You are a nutrition expert. Identify the food in this image and estimate macros for the exact portion shown. Lean toward USDA Foundation values for whole foods. Return ONLY valid JSON with no markdown:\n{"food_name":"specific name","calories":number,"protein":number,"carbs":number,"fat":number,"fiber":number,"serving_size":"portion shown"}' },
        ],
      }],
    }, 20000);
    return parseJSON(text);
  });
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
          `[{"food_name":"concise name with quantity","calories":number,"protein":number,"carbs":number,"fat":number,"fiber":number}]`,
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
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
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
    `## User's live data\n` +
    `Goals:     ${goals.calories} kcal | P ${goals.protein}g | C ${goals.carbs}g | F ${goals.fat}g | Fiber ${goals.fiber || 30}g\n` +
    `Today:     ${Math.round(totals.calories)} kcal | P ${Math.round(totals.protein)}g | C ${Math.round(totals.carbs)}g | F ${Math.round(totals.fat)}g | Fiber ${Math.round(totals.fiber)}g\n` +
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
