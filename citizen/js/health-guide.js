/**
 * RakshaSetu Verified Emergency Health Guide
 * Strictly non-generative, verified NDMA / Indian Red Cross first-responder protocols
 * Zero drug dosages, zero speculative AI medical diagnosis
 */

export const EmergencyHealthProtocols = {
  flood: {
    id: 'flood',
    title: 'Flood Water Exposure & Infection',
    source: 'National Centre for Disease Control (NCDC) / NDMA',
    lastReviewDate: '2026-01-15',
    dos: [
      'Wash any cuts, scratches, or open wounds thoroughly with clean soap and safe water immediately after any flood contact.',
      'Boil all water used for drinking, cooking, and brushing teeth for at least 3 minutes.',
      'Use rubber boots or wrap plastic covers over shoes if evacuation through shallow water is unavoidable.',
      'Keep ORS (Oral Rehydration Solution) sachets dissolved in boiled water for anyone experiencing loose motions.'
    ],
    donts: [
      'Do NOT walk barefoot or submerge open cuts in stagnant flood water (extremely high leptospirosis risk).',
      'Do NOT consume fruits, vegetables, or rations that have touched contaminated flood runoff.',
      'Do NOT use flood water for washing utensils or baby feeding bottles.',
      'Do NOT administer antibiotics without a doctor’s prescription.'
    ],
    redFlags: [
      'High spiking fever with severe calf muscle pain and red eyes (classic signs of leptospirosis).',
      'Continuous vomiting and inability to retain any fluids.',
      'Rapid breathing or sunken eyes in young children.'
    ]
  },
  injury: {
    id: 'injury',
    title: 'Trauma, Hemorrhage & Fractures',
    source: 'Indian Red Cross Society First Responder Manual',
    lastReviewDate: '2026-02-01',
    dos: [
      'Apply firm, continuous direct pressure onto bleeding wounds with a clean folded cloth for at least 10 full minutes without lifting to peek.',
      'Elevate the injured limb above the level of the heart if there is no suspected fracture.',
      'Support broken arms or legs in the position found using splints (rolled cardboard, firm wooden stick) bound with strips of cloth.',
      'Keep the injured person lying flat, calm, and covered with a dry blanket to prevent emergency shock.'
    ],
    donts: [
      'Do NOT pull out deeply embedded objects like glass shards, iron nails, or wood splinters — pad around the object to immobilize it.',
      'Do NOT apply cow dung, mud, or unverified home powders onto open lacerations.',
      'Do NOT attempt to straighten a deformed, broken bone or pop dislocated joints back into place.',
      'Do NOT give food, water, or painkiller tablets to someone needing emergency surgery.'
    ],
    redFlags: [
      'Bright red blood that spurts or pumps rhythmically from the wound.',
      'Cold, clammy skin, bluish lips, and rapid shallow breathing (hypovolemic shock).',
      'Complete numbness, tingling, or loss of pulse below an injured limb.'
    ]
  },
  heat: {
    id: 'heat',
    title: 'Heat Exhaustion & Heatstroke',
    source: 'Ministry of Health & Family Welfare Disaster Cell',
    lastReviewDate: '2026-03-01',
    dos: [
      'Move the person into an air-conditioned room or dense shade immediately.',
      'Loosen or remove restrictive, heavy clothing.',
      'Apply wet cloth packs or ice wrapped in cloth to the neck, armpits, and groin.',
      'Spray or sponge the skin with cool water while fanning continuously.'
    ],
    donts: [
      'Do NOT give chilled ice water to an actively vomiting person.',
      'Do NOT use rubbing alcohol on the skin to reduce temperature.',
      'Do NOT leave an overheated individual unattended even if they claim they feel better.'
    ],
    redFlags: [
      'Body temperature above 103°F (39.4°C) with hot, red, dry skin (sweating has completely stopped).',
      'Confusion, bizarre behavior, seizure, or unconsciousness (Life-threatening Heatstroke).'
    ]
  },
  dehydration: {
    id: 'dehydration',
    title: 'Water Purification & Dehydration',
    source: 'World Health Organization (WHO) / NDMA WASH Guidelines',
    lastReviewDate: '2026-02-20',
    dos: [
      'Prepare ORS: Dissolve one standard packet of ORS in exactly 1 litre of boiled and cooled drinking water.',
      'Emergency Homemade Solution if ORS unavailable: 6 level teaspoons of sugar + 1/2 level teaspoon of salt in 1 litre clean water.',
      'Allow suspended mud in flood water to settle in a bucket, filter top water through clean cotton saree/cloth, then boil.',
      'Add 1 Halazone/chlorine tablet (0.5g) per 20 litres of filtered water and wait 30 minutes before drinking.'
    ],
    donts: [
      'Do NOT use excessive salt when mixing emergency rehydration fluids (can cause dangerous electrolyte imbalance).',
      'Do NOT consume untreated muddy river or canal water under any circumstance.',
      'Do NOT stop breastfeeding infants during diarrheal illness.'
    ],
    redFlags: [
      'No urination for more than 8 hours, or dark amber concentrated urine.',
      'Extreme lethargy, confusion, or inability to stand without fainting.'
    ]
  }
};
