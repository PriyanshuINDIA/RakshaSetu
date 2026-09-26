/**
 * RakshaSetu Citizen Core - Safety Guidance Service
 *
 * Implements deterministic safety intent classification + verified local disaster guidance:
 * - 100% rule-based / deterministic keyword and phrase matching (NO generative AI, NO external LLM)
 * - 7 Mandated Canonical Intents:
 *   1. FLOOD_SAFETY
 *   2. HEAT_SAFETY
 *   3. UNSAFE_WATER
 *   4. TRAUMA_FIRST_AID
 *   5. CYCLONE_SAFETY
 *   6. GENERAL_EMERGENCY
 *   7. SHELTER_GUIDANCE
 * - Multi-language phrase matching (Hindi, English, Urdu, Sindhi, Bengali, Odia, Tamil, Telugu, etc.)
 * - Verified guidance dataset (NDMA, Indian Red Cross Society, MoHFW, Ministry of Jal Shakti)
 * - Structured guidance contract:
 *   { intent, language, title, immediateActions, dontActions, whenToSeekHelp, emergencyContact, voiceSummary, source, disclaimer, isSupported }
 * - Disaster-safety guardrail for unsupported general chatbot queries
 */

import languageManager, { t } from '../../i18n/index.js';
import { offlineStorage } from '../offline-storage.js';

export const SafetyIntent = {
  FLOOD_SAFETY: 'FLOOD_SAFETY',
  HEAT_SAFETY: 'HEAT_SAFETY',
  HEAT_EMERGENCY: 'HEAT_SAFETY', // Backward compatibility alias
  UNSAFE_WATER: 'UNSAFE_WATER',
  WATER_PURIFICATION: 'UNSAFE_WATER', // Backward compatibility alias
  TRAUMA_FIRST_AID: 'TRAUMA_FIRST_AID',
  CYCLONE_SAFETY: 'CYCLONE_SAFETY',
  GENERAL_EMERGENCY: 'GENERAL_EMERGENCY',
  GENERAL_SAFETY: 'GENERAL_EMERGENCY', // Backward compatibility alias
  SHELTER_GUIDANCE: 'SHELTER_GUIDANCE',
  EVACUATION: 'SHELTER_GUIDANCE', // Backward compatibility alias
  SNAKEBITE: 'TRAUMA_FIRST_AID', // Sub-intent mapping to trauma first aid
  UNSUPPORTED: 'UNSUPPORTED'
};

export class SafetyGuidanceService {
  constructor() {
    this.classifierName = 'Deterministic Safety Intent Classification';

    // Localized deterministic phrase and keyword dictionaries
    this.phraseRules = [
      // 1. FLOOD_SAFETY
      {
        intent: SafetyIntent.FLOOD_SAFETY,
        phrases: [
          'flood water is entering', 'water entering house', 'house is flooding',
          'river overflowing', 'submerged', 'inundation', 'drowning risk', 'flood rescue',
          'बाढ़ का पानी घर में आ रहा है', 'बाढ़ का पानी', 'घर में पानी भर गया',
          'नदी का जलस्तर बढ़ रहा है', 'डूब रहा है', 'बाढ़ राहत', 'बाढ़ सुरक्षा',
          'سیلاب کا پانی گھر میں آ رہا ہے', 'سیلاب کا پانی', 'گھر میں پانی',
          'ٻوڏ جو پاڻي گهر ۾ اچي رهيو آهي', 'ٻوڏ',
          'বন্যার জল ঘরে ঢুকছে', 'বন্যা', 'বন্যার ত্রাণ',
          'ବନ୍ୟା ପାଣି ଘରେ ପଶୁଛି', 'ବନ୍ୟା',
          'வெள்ள நீர் வீட்டிற்குள் நுழைகிறது', 'வெள்ளம்',
          'వరద నీరు ఇంట్లోకి వస్తోంది', 'వరద'
        ],
        keywords: [
          'flood', 'flooding', 'inundat', 'drown', 'waterlogging', 'river overflow',
          'बाढ़', 'जलभराव', 'डूबना', 'سیلاب', 'ڈوبنا', 'ٻوڏ', 'বন্যা', 'ବନ୍ୟା', 'வெள்ளம்', 'వరద'
        ]
      },

      // 2. HEAT_SAFETY
      {
        intent: SafetyIntent.HEAT_SAFETY,
        phrases: [
          'it is extremely hot', 'feeling very hot', 'heat stroke', 'sun stroke',
          'person fainted in sun', 'extreme heatwave', 'high fever and heat',
          'बहुत गर्मी लग रही है', 'लू लग गई है', 'धूप में बेहोश', 'अत्यधिक गर्मी',
          'लू से बचाव', 'चक्कर आ रहे हैं गर्मी',
          'بہت گرمی لگ رہی ہے', 'لو لگ گئی', 'دھوپ میں بے ہوش',
          'تمام گرمي لڳي رهي آهي', 'سخت گرمي',
          'খুব গরম লাগছে', 'লু লেগেছে', 'প্রচণ্ড গরম',
          'ପ୍ରଚଣ୍ଡ ଗ୍ରୀଷ୍ମ ପ୍ରବାହ', 'ଖରା ଲାଗିଛି',
          'மிகவும் வெப்பமாக இருக்கிறது', 'சூரிய வெப்பம்',
          'చాలా వేడిగా ఉంది', 'వడదెబ్బ'
        ],
        keywords: [
          'heatwave', 'heatstroke', 'sunstroke', 'faint from heat', 'too hot', 'extreme heat',
          'गर्मी', 'लू', 'धूप', 'गरमी', 'لو', 'دھوپ', 'گرمائش', 'লু', 'গরম', 'ଖରା', 'வெப்பம்', 'వడదెబ్బ'
        ]
      },

      // 3. UNSAFE_WATER
      {
        intent: SafetyIntent.UNSAFE_WATER,
        phrases: [
          'the drinking water is unsafe', 'water is dirty', 'contaminated water',
          'how to purify water', 'safe drinking water', 'chlorine tablet for water',
          'boil drinking water', 'bad smell in water',
          'पानी पीने लायक नहीं है', 'पानी गंदा है', 'पीने का पानी दूषित है',
          'पानी कैसे साफ करें', 'पानी उबालना', 'क्लोरिन की गोली', 'सुरक्षित पेयजल',
          'پینے کا پانی ناپاک ہے', 'پانی صاف کیسے کریں', 'گندا پانی',
          'پيئڻ جو پاڻي خراب آهي', 'گندو پاڻي',
          'জল পানের যোগ্য নয়', 'জল দূষিত', 'জল বিশুদ্ধকরণ',
          'ପାଣି ପିଇବା ଅସୁରକ୍ଷିତ', 'ପାଣି କିପରି ବିଶୋଧନ କରିବେ',
          'குடிநீர் பாதுகாப்பற்றது', 'நீரை சுத்திகரிக்க',
          'తాగునీరు సురక్షితం కాదు', 'నీటి శుద్దీకరణ'
        ],
        keywords: [
          'unsafe water', 'contaminated water', 'purify water', 'boil water', 'chlorine tablet', 'drinking water',
          'पीने का पानी', 'दूषित पानी', 'पानी उबाल', 'क्लोरिन', 'پینے کا پانی', 'ناپاک پانی', 'گندو پاڻي', 'জল দূষিত', 'ପାଣି ବିଶୋଧନ', 'குடிநீர்', 'తాగునీరు'
        ]
      },

      // 4. TRAUMA_FIRST_AID
      {
        intent: SafetyIntent.TRAUMA_FIRST_AID,
        phrases: [
          'first aid for bleeding', 'profuse bleeding', 'severe injury', 'wound bandage',
          'broken bone fracture', 'snake bite first aid', 'cut by debris',
          'चोट लग गई है', 'खून बह रहा है', 'घाव पर पट्टी', 'हड्डी टूट गई',
          'सांप ने काट लिया', 'रक्तस्राव प्राथमिक उपचार',
          'زخم سے خون بہہ رہا ہے', 'چوٹ لگ گئی', 'سانپ کاٹ لیا',
          'زخم مان رت وهڻ', 'ڏنگ',
          'রক্তপাত হচ্ছে', 'আঘাত লেগেছে', 'সাপের কামড়',
          'ରକ୍ତସ୍ରାବ ପ୍ରାଥମିକ ଚିକିତ୍ସା', 'ସାପ କାମୁଡ଼ିବା',
          'ரத்தப்போக்கு முதலுதவி', 'பாம்பு கடி',
          'రక్తస్రావం ప్రథమ చికిత్స', 'పాము కాటు'
        ],
        keywords: [
          'bleeding', 'wound', 'trauma', 'first aid', 'fracture', 'snake bite', 'venom', 'cut', 'injury',
          'खून', 'चोट', 'घाव', 'रक्त', 'पट्टी', 'सांप', 'زخم', 'خون', 'پٹی', 'سانپ', 'রক্তপাত', 'আঘাত', 'ରକ୍ତସ୍ରାବ', 'ரத்தப்போக்கு', 'రక్తస్రావం'
        ]
      },

      // 5. CYCLONE_SAFETY
      {
        intent: SafetyIntent.CYCLONE_SAFETY,
        phrases: [
          'cyclone storm safety', 'violent wind blowing', 'roof blown away',
          'storm surge warning', 'typhoon preparedness', 'stay indoors cyclone',
          'तूफान आ रहा है', 'चक्रवात से सुरक्षा', 'तेज आंधी हवा', 'टिन की छत उड़ गई',
          'तूफान में क्या करें', 'चक्रवाती तूफान',
          'طوفان آ رہا ہے', 'سائیکلون سے حفاظت', 'تیز ہوا',
          'طوفان اچي رهيو آهي', 'سامونڊي طوفان',
          'ঘূর্ণিঝড় সতর্কতা', 'প্রচণ্ড ঝড়', 'ঝড়ের সময় কি করবেন',
          'ବାତ୍ୟା ସୁରକ୍ଷା', 'ପ୍ରବଳ ପବନ ବହୁଛି',
          'புயல் எச்சரிக்கை', 'சூறாவளி பாதுகாப்பு',
          'తుఫాను భద్రత', 'తీవ్రమైన గాలి'
        ],
        keywords: [
          'cyclone', 'storm', 'typhoon', 'hurricane', 'gale', 'windstorm', 'roof sheet',
          'तूफान', 'चक्रवात', 'आंधी', 'طوفان', 'سائیکلون', 'ঘূর্ণিঝড়', 'ବାତ୍ୟା', 'புயல்', 'తుఫాను'
        ]
      },

      // 6. GENERAL_EMERGENCY
      {
        intent: SafetyIntent.GENERAL_EMERGENCY,
        phrases: [
          'immediate help needed', 'general emergency', 'emergency guidelines',
          'who to call in emergency', 'national emergency number', 'urgent rescue',
          'मदद चाहिए', 'आपातकाल में क्या करें', 'आपातकालीन सहायता', 'इमरजेंसी नंबर',
          'मदद की जरूरत है', 'सुरक्षा निर्देश',
          'فوری مدد چاہیے', 'ہنگامی حالت', 'ایمرجنسی نمبر',
          'مدد گهرجي', 'هنگامي صورتحال',
          'জরুরি সাহায্য প্রয়োজন', 'জরুরি নম্বর',
          'ଜରୁରୀ ସାହାଯ୍ୟ ଆବଶ୍ୟକ', 'ଜରୁରୀକାଳୀନ ନମ୍ବର',
          'அவசர உதவி தேவை', 'அவசர எண்',
          'తక్షణ సహాయం కావాలి', 'అత్యవసర సంఖ్య'
        ],
        keywords: [
          'emergency', 'urgent help', 'rescue needed', 'call 112', 'helpline', 'disaster alert',
          'आपातकाल', 'मदद', 'सहायता', 'बचाव', 'ہنگامی', 'مدد', 'জরুরি', 'ଜରୁରୀ', 'அவசரம்', 'అత్యవసరం'
        ]
      },

      // 7. SHELTER_GUIDANCE
      {
        intent: SafetyIntent.SHELTER_GUIDANCE,
        phrases: [
          'where is the nearest shelter', 'relief shelter location', 'how to reach shelter',
          'evacuation center', 'camp accommodation', 'safe building location',
          'शरणस्थल कहाँ है', 'निकटतम राहत शिविर', 'शरण स्थल', 'आश्रय कहाँ मिलेगा',
          'राहत शिविर की जानकारी', 'सुरक्षित स्थान पर कैसे जाएँ',
          'قریبی پناہ گاہ کہاں ہے', 'امدادی کیمپ', 'محفوظ مقام',
          'ويجھي پناهه گاهه ڪٿي آهي', 'امداد ڪيمپ',
          'নিকটতম আশ্রয়কেন্দ্র কোথায়', 'ত্রাণ শিবির',
          'ନିକଟତମ ଆଶ୍ରୟସ୍ଥଳ କେଉଁଠି', 'ରିଲିଫ କ୍ୟାମ୍ପ',
          'அருகிலுள்ள புகலிடம் எங்கே', 'நிவாரண முகாம்',
          'సమీప పునరావాస కేంద్రం ఎక్కడ ఉంది', 'రహత్ శిబిరం'
        ],
        keywords: [
          'shelter', 'evacuat', 'relief camp', 'safe house', 'refugee center', 'accommodation',
          'शरणस्थल', 'शिविर', 'आश्रय', 'शरण', 'پناہ گاہ', 'کیمپ', 'پناهه گاهه', 'আশ্রয়কেন্দ্র', 'ଆଶ୍ରୟସ୍ଥଳ', 'புகலிடம்', 'పునరావాస'
        ]
      }
    ];

    // Explicit non-disaster query keywords for conversational guardrail
    this.unsupportedKeywords = [
      'recipe', 'cook', 'movie', 'song', 'joke', 'poem', 'capital of', 'who is',
      'cricket score', 'stock price', 'weather forecast tomorrow in paris', 'homework',
      'restaurant', 'shopping', 'flight ticket', 'hotel booking', 'chatgpt', 'openai', 'gemini'
    ];
  }

  /**
   * Deterministic Intent Classification
   * Matches user text against exact phrases first, then domain keyword roots.
   */
  detectIntent(query) {
    const q = String(query || '').toLowerCase().trim();
    if (!q) return SafetyIntent.GENERAL_EMERGENCY;

    // Check for explicit non-safety guardrail first
    for (const ukw of this.unsupportedKeywords) {
      if (q.includes(ukw)) {
        return SafetyIntent.UNSUPPORTED;
      }
    }

    // 1. Check exact phrase match (highest confidence)
    for (const rule of this.phraseRules) {
      for (const phrase of rule.phrases) {
        if (q.includes(phrase.toLowerCase())) {
          return rule.intent;
        }
      }
    }

    // 2. Check keyword match
    for (const rule of this.phraseRules) {
      for (const kw of rule.keywords) {
        if (q.includes(kw.toLowerCase())) {
          return rule.intent;
        }
      }
    }

    // If query has some disaster words like 'danger' or 'problem' or is ambiguous:
    if (q.includes('help') || q.includes('save') || q.includes('danger') || q.includes('खतरा') || q.includes('बचाओ') || q.includes('मदद')) {
      return SafetyIntent.GENERAL_EMERGENCY;
    }

    // Guardrail: Any other unsupported general conversation
    return SafetyIntent.UNSUPPORTED;
  }

  /**
   * Retrieve structured safety guidance for classified intent
   */
  getGuidanceForIntent(intent, userLanguage = 'en') {
    const raw = this._resolveGuidanceForIntent(intent, userLanguage);
    if (!raw) return raw;
    return {
      ...raw,
      dos: raw.immediateActions || [],
      donts: raw.dontActions || [],
      voiceText: raw.voiceSummary || '',
      category: raw.title || ''
    };
  }

  _resolveGuidanceForIntent(intent, userLanguage = 'en') {
    const lang = userLanguage || 'en';

    switch (intent) {
      case SafetyIntent.FLOOD_SAFETY: {
        return {
          intent: SafetyIntent.FLOOD_SAFETY,
          language: lang,
          title: t('alerts.floodTitle', 'NDMA Flood Safety Protocol'),
          immediateActions: [
            t('assistant.floodDo1', 'Move immediately to the highest accessible floor or designated concrete flood shelter.'),
            t('assistant.floodDo2', 'Boil all drinking water for at least 3 minutes, or use 1 chlorine tablet per 20 litres of clear water.'),
            t('assistant.floodDo3', 'Signal rescue teams using bright cloth, torches, or 3 short whistle blasts.')
          ],
          dontActions: [
            t('assistant.floodDont1', 'Do NOT walk barefoot through stagnant flood water (high risk of leptospirosis and submerged debris).'),
            t('assistant.floodDont2', 'Do NOT consume any food items that have come into contact with flood waters.'),
            t('assistant.floodDont3', 'Do NOT touch downed power cables or step into puddles near broken utility poles.')
          ],
          whenToSeekHelp: [
            t('assistant.floodHelp1', 'Rising flood water exceeding safe floor height with no upper retreat.'),
            t('assistant.floodHelp2', 'High fever, severe diarrhea, or vomiting indicating waterborne infection.'),
            t('assistant.floodHelp3', 'Snakebite or deep lacerations from submerged iron or glass debris.')
          ],
          emergencyContact: '1070',
          emergencyContactLabel: '1070 State Disaster Relief / 112 National ERSS',
          voiceSummary: 'Move immediately to higher ground or a designated shelter. Boil drinking water for 3 minutes. Do not walk barefoot in flood water.',
          source: 'NDMA Standard Operating Procedure / Indian Red Cross Society',
          disclaimer: 'Verified Disaster Safety Heuristic • Not a substitute for live on-scene emergency directives.',
          isSupported: true
        };
      }

      case SafetyIntent.HEAT_SAFETY: {
        return {
          intent: SafetyIntent.HEAT_SAFETY,
          language: lang,
          title: t('alerts.heatTitle', 'NDMA Severe Heatwave Response'),
          immediateActions: [
            t('assistant.heatDo1', 'Move the affected person to a shaded, well-ventilated area immediately.'),
            t('assistant.heatDo2', 'Apply wet cloth compresses to neck, armpits, and groin to rapidly lower core body temperature.'),
            t('assistant.heatDo3', 'Provide small, frequent sips of Oral Rehydration Salts (ORS), lemon water, or salted buttermilk if conscious.')
          ],
          dontActions: [
            t('assistant.heatDont1', 'Do NOT leave children, elderly persons, or pets inside parked vehicles.'),
            t('assistant.heatDont2', 'Do NOT force liquids into an unconscious or vomiting person.'),
            t('assistant.heatDont3', 'Do NOT consume alcohol, aerated beverages, or heavy fried meals during peak heat hours.')
          ],
          whenToSeekHelp: [
            t('assistant.heatHelp1', 'Core body temperature exceeding 103°F (39.4°C) with hot, dry, non-sweating skin.'),
            t('assistant.heatHelp2', 'Loss of consciousness, seizures, mental confusion, or slurred speech.')
          ],
          emergencyContact: '108',
          emergencyContactLabel: '108 Emergency Ambulance / 1075 Telemedicine',
          voiceSummary: 'Move to a shaded area immediately. Apply wet cloths to neck and armpits. Give ORS if conscious. Call 108 if body temperature exceeds 103 degrees.',
          source: 'Ministry of Health & Family Welfare / NDMA Heatwave Guidelines',
          disclaimer: 'Verified Public Health Guidance • Zero medication or drug dosage recommendations.',
          isSupported: true
        };
      }

      case SafetyIntent.UNSAFE_WATER: {
        return {
          intent: SafetyIntent.UNSAFE_WATER,
          language: lang,
          title: t('alerts.waterTitle', 'Emergency Drinking Water Purification'),
          immediateActions: [
            t('assistant.waterDo1', 'Boil water vigorously for at least 3 minutes before consuming, cooking, or brushing teeth.'),
            t('assistant.waterDo2', 'If boiling is not possible, add 1 chlorine tablet per 20 litres of clear water; wait 30 minutes before use.'),
            t('assistant.waterDo3', 'Store treated water in clean, covered, elevated containers away from mud and flood silt.')
          ],
          dontActions: [
            t('assistant.waterDont1', 'Do NOT drink untreated tap or tube-well water in inundated flood zones.'),
            t('assistant.waterDont2', 'Do NOT use muddy utensils or bare hands to scoop drinking water.'),
            t('assistant.waterDont3', 'Do NOT use chemical tablets beyond verified public health instructions.')
          ],
          whenToSeekHelp: [
            t('assistant.waterHelp1', 'Severe watery diarrhea with sunken eyes and acute signs of dehydration.'),
            t('assistant.waterHelp2', 'Sudden cluster of gastrointestinal illness in family or community.')
          ],
          emergencyContact: '1077',
          emergencyContactLabel: '1077 District Health Cell / 104 Health Helpline',
          voiceSummary: 'Boil water vigorously for at least 3 minutes, or dissolve 1 chlorine tablet per 20 litres of water. Wait 30 minutes before drinking.',
          source: 'Ministry of Jal Shakti / Indian Red Cross Society Manual',
          disclaimer: 'Verified Water Sanitation Guidelines • Does not substitute official municipal advisories.',
          isSupported: true
        };
      }

      case SafetyIntent.TRAUMA_FIRST_AID: {
        return {
          intent: SafetyIntent.TRAUMA_FIRST_AID,
          language: lang,
          title: t('alerts.traumaTitle', 'Trauma & Bleeding First Responder Protocol'),
          immediateActions: [
            t('assistant.traumaDo1', 'Apply continuous firm direct pressure onto the bleeding wound with a clean cloth for at least 10 minutes without lifting.'),
            t('assistant.traumaDo2', 'Elevate the injured limb above heart level if no bone fracture is suspected.'),
            t('assistant.traumaDo3', 'Keep the victim lying flat, calm, and covered with a blanket to prevent hypothermic shock.')
          ],
          dontActions: [
            t('assistant.traumaDont1', 'Do NOT remove deeply embedded objects (knives, glass, rebar) — stabilize firmly in place with cloth roll.'),
            t('assistant.traumaDont2', 'Do NOT administer pain medications, aspirin, or sedatives without a licensed doctor.'),
            t('assistant.traumaDont3', 'Do NOT apply tight tourniquets unless specially trained (risk of tissue necrosis).')
          ],
          whenToSeekHelp: [
            t('assistant.traumaHelp1', 'Spurting or pulsating blood that does not stop after 10 minutes of direct pressure.'),
            t('assistant.traumaHelp2', 'Suspected spinal, skull, or neck trauma with numbness or loss of sensation.')
          ],
          emergencyContact: '108',
          emergencyContactLabel: '108 Emergency Ambulance / 112 National ERSS',
          voiceSummary: 'Apply firm direct pressure to the wound with a clean cloth for at least 10 minutes. Elevate the limb. Do not remove embedded objects. Call 108.',
          source: 'Indian Red Cross Society / NDMA First Aid Manual',
          disclaimer: 'First Aid Directives Only • Seek certified medical assistance immediately.',
          isSupported: true
        };
      }

      case SafetyIntent.CYCLONE_SAFETY: {
        return {
          intent: SafetyIntent.CYCLONE_SAFETY,
          language: lang,
          title: t('alerts.cycloneTitle', 'NDMA Cyclone Preparedness Protocol'),
          immediateActions: [
            t('assistant.cycloneDo1', 'Stay indoors away from glass windows and external doors; anchor loose tin roofing sheets.'),
            t('assistant.cycloneDo2', 'Store at least 72 hours of clean drinking water, non-perishable food, and essential battery lights.'),
            t('assistant.cycloneDo3', 'Disconnect central cooking gas cylinders and turn off main electrical circuit breakers if water enters.')
          ],
          dontActions: [
            t('assistant.cycloneDont1', 'Do NOT venture outside when the eye of the storm passes (winds temporarily drop, but violent reverse gusts follow).'),
            t('assistant.cycloneDont2', 'Do NOT touch fallen electrical cables or stand near telephone poles.'),
            t('assistant.cycloneDont3', 'Do NOT spread unverified panic voice notes from social media.')
          ],
          whenToSeekHelp: [
            t('assistant.cycloneHelp1', 'Structural wall collapse, roof detachment, or immediate danger of building breach.'),
            t('assistant.cycloneHelp2', 'Severe traumatic injury requiring surgical intervention.')
          ],
          emergencyContact: '1070',
          emergencyContactLabel: '1070 State Disaster Management / 112 National ERSS',
          voiceSummary: 'Stay indoors away from glass windows. Keep 72 hours of clean water ready. Do not step out during the calm eye of the storm.',
          source: 'NDMA Cyclone Guidelines & State Disaster Management Authority',
          disclaimer: 'Verified Structural Safety Protocol • Follow District Collectorate evacuation orders.',
          isSupported: true
        };
      }

      case SafetyIntent.SHELTER_GUIDANCE: {
        return {
          intent: SafetyIntent.SHELTER_GUIDANCE,
          language: lang,
          title: t('assistant.shelterTitle', 'Relief Shelter & Evacuation Guidance'),
          immediateActions: [
            t('assistant.shelterDo1', 'Open the Safety Map screen to locate active designated relief shelters in your sector.'),
            t('assistant.shelterDo2', 'Use "Safe Route" to calculate elevated ridge pedestrian paths avoiding flooded culverts.'),
            t('assistant.shelterDo3', 'Carry a waterproof emergency pouch containing government ID cards, land titles, and prescribed medications.')
          ],
          dontActions: [
            t('assistant.shelterDont1', 'Do NOT delay evacuation until flood water breaches road causeways.'),
            t('assistant.shelterDont2', 'Do NOT leave livestock tied up inside flood-prone enclosures.'),
            t('assistant.shelterDont3', 'Do NOT crowd informal unsafe river embankments.')
          ],
          whenToSeekHelp: [
            t('assistant.shelterHelp1', 'Stranded with elderly, infants, or pregnant women with no safe dry route.'),
            t('assistant.shelterHelp2', 'Shelter capacity full or inaccessible due to deep water.')
          ],
          emergencyContact: '1077',
          emergencyContactLabel: '1077 District Emergency Cell / 112 National ERSS',
          voiceSummary: 'Open the Safety Map to locate your nearest active shelter and calculate an elevated safe route. Carry your ID papers in a waterproof pouch.',
          source: 'District Disaster Management Authority (DDMA) / NDMA Shelter Framework',
          disclaimer: 'Prototype Safe Route heuristic available on Safety Map. Verify road conditions on scene.',
          isSupported: true
        };
      }

      case SafetyIntent.GENERAL_EMERGENCY: {
        return {
          intent: SafetyIntent.GENERAL_EMERGENCY,
          language: lang,
          title: t('alerts.generalTitle', 'NDMA Public Emergency Directives'),
          immediateActions: [
            t('assistant.generalDo1', 'Confirm your emergency contacts and locate the nearest designated shelter from the Safety Map.'),
            t('assistant.generalDo2', 'Conserve mobile battery: reduce screen brightness and close non-emergency applications.'),
            t('assistant.generalDo3', 'If trapped or in life-threatening danger, tap the EMERGENCY SOS button immediately.')
          ],
          dontActions: [
            t('assistant.generalDont1', 'Do NOT spread unverified rumors, panic audio notes, or speculative social media messages.'),
            t('assistant.generalDont2', 'Do NOT enter fast-moving flood waters, damaged buildings, or downed electrical lines.')
          ],
          whenToSeekHelp: [
            t('assistant.generalHelp1', 'Immediate danger to life, acute illness, or lack of shelter during extreme disaster.')
          ],
          emergencyContact: '112',
          emergencyContactLabel: '112 National Emergency Response Support System (ERSS)',
          voiceSummary: 'Locate your nearest shelter on the Safety Map. Conserve your phone battery. Tap Emergency SOS if in immediate distress.',
          source: 'National Disaster Management Authority (NDMA)',
          disclaimer: 'Public Emergency Directive • Official All-India Disaster Response Standard.',
          isSupported: true
        };
      }

      default: {
        // Guardrail: Explicit unsupported non-safety query response
        return {
          intent: SafetyIntent.UNSUPPORTED,
          language: lang,
          title: t('assistant.unsupportedTitle', 'Safety Domain Assistant'),
          immediateActions: [
            t('assistant.unsupportedAction1', 'Ask questions about flood safety, heatwaves, water purification, first aid, cyclones, or shelters.'),
            t('assistant.unsupportedAction2', 'For life-threatening emergencies, tap the dominant Emergency SOS button on the Home screen.')
          ],
          dontActions: [],
          whenToSeekHelp: [],
          emergencyContact: '112',
          emergencyContactLabel: '112 National ERSS',
          voiceSummary: 'I can help with flood safety, heat safety, unsafe water, basic emergency guidance, shelter guidance, and other supported disaster-safety topics.',
          source: 'RakshaSetu Disaster Safety Guardrail',
          disclaimer: 'I can help with flood safety, heat safety, unsafe water, basic emergency guidance, shelter guidance, and other supported disaster-safety topics.',
          isSupported: false
        };
      }
    }
  }

  /**
   * Main query execution pipeline:
   * Query -> Language selection -> Deterministic classifier -> Verified guidance -> Structured payload
   */
  getGuidance(query, userLanguage = 'en') {
    const intent = this.detectIntent(query);
    return this.getGuidanceForIntent(intent, userLanguage);
  }
}

export const safetyGuidanceService = new SafetyGuidanceService();
