import type { EmissionFactors, Averages, Action } from '../types';

/**
 * Emission factors (kg CO₂e per unit), India-specific where data exists.
 *
 * Sources:
 *   [CEA]   Central Electricity Authority, CO₂ Baseline Database v19 (2024) — grid 0.82 kg/kWh
 *           https://cea.nic.in/cdm-co2-baseline-database/
 *   [ICCT]  International Council on Clean Transportation — India road transport intensities
 *           https://theicct.org/region/india/
 *   [IPCC]  IPCC AR6 WG3 (2022), Annex III lifecycle factors — food & goods
 *           https://www.ipcc.ch/report/ar6/wg3/
 *   [DEFRA] UK DEFRA GHG Conversion Factors 2023 — used where no Indian figure exists (flights, appliances)
 *           https://www.gov.uk/government/publications/greenhouse-gas-reporting-conversion-factors-2023
 *   [OWID]  Our World in Data, "Food: greenhouse gas emissions across the supply chain" (Poore & Nemecek, 2018)
 *           https://ourworldindata.org/food-choice-vs-eating-local
 *
 * Negative factors represent net CO₂ avoided (e.g. recycling, composting).
 */
const EMISSION_FACTORS: EmissionFactors = {
  transport: {
    petrol_car:      { factor: 0.171, unit: 'km',        label: 'Petrol Car' },              // ICCT — avg Indian petrol car, tank-to-wheel
    diesel_car:      { factor: 0.156, unit: 'km',        label: 'Diesel Car' },              // ICCT — avg Indian diesel car
    two_wheeler:     { factor: 0.063, unit: 'km',        label: 'Two-Wheeler (Petrol)' },    // ICCT — 100–150cc motorcycle
    auto_rickshaw:   { factor: 0.080, unit: 'km',        label: 'Auto-Rickshaw (CNG)' },     // ICCT — CNG three-wheeler
    bus:             { factor: 0.089, unit: 'km',        label: 'City Bus' },                // ICCT — per-passenger, avg urban occupancy
    metro:           { factor: 0.041, unit: 'km',        label: 'Metro / Local Train' },     // CEA — per-passenger, electric traction on Indian grid
    domestic_flight: { factor: 0.255, unit: 'km',        label: 'Domestic Flight' },         // DEFRA 2023 — short-haul, per passenger-km
    ev_car:          { factor: 0.085, unit: 'km',        label: 'Electric Car (Indian grid)' }, // CEA — 0.13 kWh/km × 0.82 kg/kWh, well-to-wheel
  },
  energy: {
    electricity: { factor: 0.82,  unit: 'kWh',      label: 'Electricity (Indian grid)' },   // CEA v19 (2024) — national grid intensity
    lpg:         { factor: 39.6,  unit: 'cylinder',  label: 'LPG Cylinder (14.2 kg)' },      // IPCC — 2.79 kg CO₂/kg LPG × 14.2 kg
    ac_hour:     { factor: 1.23,  unit: 'hour',      label: 'Air Conditioning (1.5 ton AC)' }, // CEA — 1.5 kWh/hr × 0.82 kg/kWh
  },
  food: {
    veg_meal:     { factor: 0.35, unit: 'meal',    label: 'Vegetarian Meal' },              // OWID/IPCC — plant-based plate, supply-chain avg
    egg_meal:     { factor: 0.80, unit: 'meal',    label: 'Egg-based Meal' },               // OWID/IPCC
    chicken_meal: { factor: 1.26, unit: 'meal',    label: 'Chicken Meal' },                 // OWID/IPCC — poultry ~6 kg CO₂e/kg, ~200 g serving
    mutton_meal:  { factor: 3.90, unit: 'meal',    label: 'Mutton/Lamb Meal' },             // OWID/IPCC — lamb ~24 kg CO₂e/kg
    milk_500ml:   { factor: 0.60, unit: 'serving', label: 'Dairy – 500 ml Milk' },          // OWID/IPCC — ~1.2 kg CO₂e/litre
  },
  shopping: {
    clothing:     { factor: 5.5,   unit: 'item', label: 'Clothing Item' },                  // DEFRA 2023 — avg garment lifecycle
    smartphone:   { factor: 70.0,  unit: 'item', label: 'Smartphone' },                     // IPCC/manufacturer LCA — embodied carbon
    laptop:       { factor: 350.0, unit: 'item', label: 'Laptop' },                         // IPCC/manufacturer LCA — embodied carbon
    appliance:    { factor: 200.0, unit: 'item', label: 'Home Appliance' },                 // DEFRA 2023 — avg major appliance, embodied
    online_order: { factor: 0.50,  unit: 'item', label: 'Online Order (delivery)' },        // DEFRA 2023 — last-mile delivery + packaging
  },
  waste: {
    recycling:    { factor: -2.0, unit: 'month', label: 'Monthly Recycling (saves CO₂)' },  // IPCC — avoided virgin-material emissions
    composting:   { factor: -1.5, unit: 'month', label: 'Monthly Composting (saves CO₂)' }, // IPCC — avoided landfill methane
    landfill_bag: { factor:  1.2, unit: 'bag',   label: 'Landfill Waste Bag' },             // IPCC — mixed MSW to landfill, ~10 kg bag
  },
};

/**
 * Benchmark footprints (kg CO₂e).
 *   india/global annual — World Bank, CO₂ emissions per capita, 2022 (India 1.9 t, world 4.7 t)
 *     https://data.worldbank.org/indicator/EN.ATM.CO2E.PC
 *   paris annual — IPCC AR6: ~2.5 t/capita/yr is the 2030 budget consistent with the 1.5 °C pathway
 *   *_monthly are the annual figures ÷ 12, rounded.
 */
const AVERAGES: Averages = {
  india_monthly:  158,   // 1900 / 12
  global_monthly: 392,   // 4700 / 12
  paris_monthly:  208,   // 2500 / 12
  india_annual:   1900,  // World Bank 2022 — India per capita
  global_annual:  4700,  // World Bank 2022 — world per capita
  paris_annual:   2500,  // IPCC AR6 — 1.5 °C-aligned 2030 budget
};

const ACTIONS: Action[] = [
  {
    id: 'metro_commute', category: 'transport',
    title: 'Switch daily commute to Metro/Train',
    description: 'Replace a 15 km car commute with metro. Saves ~33 kg CO₂/month.',
    impact_kg_month: 33, difficulty: 'medium', tags: ['commute', 'transport'],
  },
  {
    id: 'two_wheeler_commute', category: 'transport',
    title: 'Use a two-wheeler instead of car for short trips',
    description: 'For trips under 5 km, switch car to bike. Saves ~16 kg CO₂/month.',
    impact_kg_month: 16, difficulty: 'easy', tags: ['commute', 'transport'],
  },
  {
    id: 'ev_two_wheeler', category: 'transport',
    title: 'Switch to an electric two-wheeler',
    description: 'Replace petrol bike with EV for daily 10 km commute. Saves ~13 kg CO₂/month.',
    impact_kg_month: 13, difficulty: 'hard', tags: ['ev', 'transport'],
  },
  {
    id: 'reduce_ac', category: 'energy',
    title: 'Reduce AC usage by 2 hours/day',
    description: 'Set AC to 24°C and use ceiling fans. Saves ~74 kg CO₂/month.',
    impact_kg_month: 74, difficulty: 'easy', tags: ['ac', 'energy', 'home'],
  },
  {
    id: 'led_lights', category: 'energy',
    title: 'Replace all bulbs with LED',
    description: 'Switch to LED lighting throughout your home. Saves ~5 kg CO₂/month.',
    impact_kg_month: 5, difficulty: 'easy', tags: ['lighting', 'energy'],
  },
  {
    id: 'solar_water_heater', category: 'energy',
    title: 'Install a solar water heater',
    description: 'Replace electric geyser with solar heater. Saves ~20 kg CO₂/month.',
    impact_kg_month: 20, difficulty: 'hard', tags: ['solar', 'energy'],
  },
  {
    id: 'veg_days', category: 'food',
    title: 'Have 3 meat-free days per week',
    description: 'Replace chicken meals with veg on 3 days. Saves ~12 kg CO₂/month.',
    impact_kg_month: 12, difficulty: 'easy', tags: ['diet', 'food'],
  },
  {
    id: 'local_produce', category: 'food',
    title: 'Buy local and seasonal produce',
    description: 'Choose local markets over supermarket imports. Saves ~5 kg CO₂/month.',
    impact_kg_month: 5, difficulty: 'easy', tags: ['food', 'local'],
  },
  {
    id: 'reduce_clothing', category: 'shopping',
    title: 'Buy one fewer clothing item per month',
    description: 'Choose secondhand or repair existing clothes. Saves ~5.5 kg CO₂/month.',
    impact_kg_month: 5.5, difficulty: 'easy', tags: ['fashion', 'shopping'],
  },
  {
    id: 'start_composting', category: 'waste',
    title: 'Start composting kitchen waste',
    description: 'Compost vegetable peels and food scraps. Saves ~1.5 kg CO₂/month.',
    impact_kg_month: 1.5, difficulty: 'medium', tags: ['composting', 'waste'],
  },
  {
    id: 'recycling_habit', category: 'waste',
    title: 'Segregate and recycle dry waste',
    description: 'Separate paper, plastic, and metal for recycling. Saves ~2 kg CO₂/month.',
    impact_kg_month: 2, difficulty: 'easy', tags: ['recycling', 'waste'],
  },
  {
    id: 'wfh_days', category: 'transport',
    title: 'Work from home 2 days per week',
    description: 'Eliminate commute twice a week. Saves ~14 kg CO₂/month (15 km petrol car).',
    impact_kg_month: 14, difficulty: 'medium', tags: ['wfh', 'transport', 'commute'],
  },
];

export { EMISSION_FACTORS, AVERAGES, ACTIONS };
