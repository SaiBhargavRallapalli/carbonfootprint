'use strict';

// Emission factors in kg CO₂e per unit — Indian context (CEA 2024, IPCC AR6, ICCT)
const EMISSION_FACTORS = {
  transport: {
    petrol_car:    { factor: 0.171, unit: 'km', label: 'Petrol Car' },
    diesel_car:    { factor: 0.156, unit: 'km', label: 'Diesel Car' },
    two_wheeler:   { factor: 0.063, unit: 'km', label: 'Two-Wheeler (Petrol)' },
    auto_rickshaw: { factor: 0.080, unit: 'km', label: 'Auto-Rickshaw (CNG)' },
    bus:           { factor: 0.089, unit: 'km', label: 'City Bus' },
    metro:         { factor: 0.041, unit: 'km', label: 'Metro / Local Train' },
    domestic_flight: { factor: 0.255, unit: 'km', label: 'Domestic Flight' },
    ev_car:        { factor: 0.085, unit: 'km', label: 'Electric Car (Indian grid)' },
  },
  energy: {
    electricity: { factor: 0.82,  unit: 'kWh',      label: 'Electricity (Indian grid)' },
    lpg:         { factor: 39.6,  unit: 'cylinder',  label: 'LPG Cylinder (14.2 kg)' },
    ac_hour:     { factor: 1.23,  unit: 'hour',      label: 'Air Conditioning (1.5 ton AC)' },
  },
  food: {
    veg_meal:     { factor: 0.35, unit: 'meal', label: 'Vegetarian Meal' },
    egg_meal:     { factor: 0.80, unit: 'meal', label: 'Egg-based Meal' },
    chicken_meal: { factor: 1.26, unit: 'meal', label: 'Chicken Meal' },
    mutton_meal:  { factor: 3.90, unit: 'meal', label: 'Mutton/Lamb Meal' },
    milk_500ml:   { factor: 0.60, unit: 'serving', label: 'Dairy – 500 ml Milk' },
  },
  shopping: {
    clothing:    { factor: 5.5,   unit: 'item',  label: 'Clothing Item' },
    smartphone:  { factor: 70.0,  unit: 'item',  label: 'Smartphone' },
    laptop:      { factor: 350.0, unit: 'item',  label: 'Laptop' },
    appliance:   { factor: 200.0, unit: 'item',  label: 'Home Appliance' },
    online_order: { factor: 0.50, unit: 'item',  label: 'Online Order (delivery)' },
  },
  waste: {
    recycling: { factor: -2.0, unit: 'month', label: 'Monthly Recycling (saves CO₂)' },
    composting: { factor: -1.5, unit: 'month', label: 'Monthly Composting (saves CO₂)' },
    landfill_bag: { factor: 1.2, unit: 'bag', label: 'Landfill Waste Bag' },
  },
};

// Monthly carbon footprint benchmarks in kg CO₂e
const AVERAGES = {
  india_monthly:  158,   // 1.9 tCO₂/year → Indian average (World Bank 2022)
  global_monthly: 392,   // 4.7 tCO₂/year → global average
  paris_monthly:  208,   // 2.5 tCO₂/year → 1.5°C-aligned budget
  india_annual:   1900,
  global_annual:  4700,
  paris_annual:   2500,
};

// Catalog of actionable recommendations with quantified CO₂ savings (kg/month)
const ACTIONS = [
  {
    id: 'metro_commute',
    category: 'transport',
    title: 'Switch daily commute to Metro/Train',
    description: 'Replace a 15 km car commute with metro. Saves ~33 kg CO₂/month.',
    impact_kg_month: 33,
    difficulty: 'medium',
    tags: ['commute', 'transport'],
  },
  {
    id: 'two_wheeler_commute',
    category: 'transport',
    title: 'Use a two-wheeler instead of car for short trips',
    description: 'For trips under 5 km, switch car to bike. Saves ~16 kg CO₂/month.',
    impact_kg_month: 16,
    difficulty: 'easy',
    tags: ['commute', 'transport'],
  },
  {
    id: 'ev_two_wheeler',
    category: 'transport',
    title: 'Switch to an electric two-wheeler',
    description: 'Replace petrol bike with EV for daily 10 km commute. Saves ~13 kg CO₂/month.',
    impact_kg_month: 13,
    difficulty: 'hard',
    tags: ['ev', 'transport'],
  },
  {
    id: 'reduce_ac',
    category: 'energy',
    title: 'Reduce AC usage by 2 hours/day',
    description: 'Set AC to 24°C and use ceiling fans. Saves ~74 kg CO₂/month.',
    impact_kg_month: 74,
    difficulty: 'easy',
    tags: ['ac', 'energy', 'home'],
  },
  {
    id: 'led_lights',
    category: 'energy',
    title: 'Replace all bulbs with LED',
    description: 'Switch to LED lighting throughout your home. Saves ~5 kg CO₂/month.',
    impact_kg_month: 5,
    difficulty: 'easy',
    tags: ['lighting', 'energy'],
  },
  {
    id: 'solar_water_heater',
    category: 'energy',
    title: 'Install a solar water heater',
    description: 'Replace electric geyser with solar heater. Saves ~20 kg CO₂/month.',
    impact_kg_month: 20,
    difficulty: 'hard',
    tags: ['solar', 'energy'],
  },
  {
    id: 'veg_days',
    category: 'food',
    title: 'Have 3 meat-free days per week',
    description: 'Replace chicken meals with veg on 3 days. Saves ~12 kg CO₂/month.',
    impact_kg_month: 12,
    difficulty: 'easy',
    tags: ['diet', 'food'],
  },
  {
    id: 'local_produce',
    category: 'food',
    title: 'Buy local and seasonal produce',
    description: 'Choose local markets over supermarket imports. Saves ~5 kg CO₂/month.',
    impact_kg_month: 5,
    difficulty: 'easy',
    tags: ['food', 'local'],
  },
  {
    id: 'reduce_clothing',
    category: 'shopping',
    title: 'Buy one fewer clothing item per month',
    description: 'Choose secondhand or repair existing clothes. Saves ~5.5 kg CO₂/month.',
    impact_kg_month: 5.5,
    difficulty: 'easy',
    tags: ['fashion', 'shopping'],
  },
  {
    id: 'start_composting',
    category: 'waste',
    title: 'Start composting kitchen waste',
    description: 'Compost vegetable peels and food scraps. Saves ~1.5 kg CO₂/month.',
    impact_kg_month: 1.5,
    difficulty: 'medium',
    tags: ['composting', 'waste'],
  },
  {
    id: 'recycling_habit',
    category: 'waste',
    title: 'Segregate and recycle dry waste',
    description: 'Separate paper, plastic, and metal for recycling. Saves ~2 kg CO₂/month.',
    impact_kg_month: 2,
    difficulty: 'easy',
    tags: ['recycling', 'waste'],
  },
  {
    id: 'wfh_days',
    category: 'transport',
    title: 'Work from home 2 days per week',
    description: 'Eliminate commute twice a week. Saves ~14 kg CO₂/month (15 km petrol car).',
    impact_kg_month: 14,
    difficulty: 'medium',
    tags: ['wfh', 'transport', 'commute'],
  },
];

module.exports = { EMISSION_FACTORS, AVERAGES, ACTIONS };
