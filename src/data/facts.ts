// =============================================================================
// facts.ts — Curated Nigerian fun facts, keyed by tile position
// -----------------------------------------------------------------------------
// Bundled at build time. No API calls, no latency, no network failures.
// Facts are sourced from publicly available Wikipedia/cultural references.
//
// PROPERTY_FACTS: one fact per ownable tile, keyed by board position (pos).
// LANGUAGE_CULTURE_TRIVIA: broader Nigerian language & culture facts.
// HISTORY_GEOGRAPHY_TRIVIA: Nigerian history & geography facts.
// =============================================================================

/**
 * Maps tile `pos` (0–39, matching board.ts) → a short fun fact.
 * Covers all 22 properties, 4 airports, and 2 utilities.
 * Keyed by position instead of name so tile renames don't silently break lookups.
 */
export const PROPERTY_FACTS: Record<number, string> = {
  // ── Borno (brown) ──────────────────────────────────────────────────────
  // pos 1: Maiduguri
  1: "Maiduguri is the capital of Borno State, founded in 1907. Nicknamed 'The Home of Peace,' it's one of the largest cities in northeast Nigeria and a historic gateway to the Sahel.",
  // pos 3: Bama
  3: "Bama sits on the Yedseram River in southern Borno. It was a key stop on the trans-Saharan trade route and is famous for its historic emirate palace, dating back centuries.",

  // ── Kwara (lightblue) ──────────────────────────────────────────────────
  // pos 6: Ilorin
  6: "Ilorin, capital of Kwara State, is called 'The Gateway to the North.' The Emir's palace dates to the 19th-century Fulani jihad, and the city uniquely blends Yoruba and Hausa cultures.",
  // pos 8: Sango
  8: "Sango is a bustling area of Ilorin named after the Yoruba god of thunder and lightning — one of the most powerful orishas in the Yoruba pantheon, worshipped across West Africa and the diaspora.",
  // pos 9: Tanke
  9: "Tanke is a fast-growing university district in Ilorin, home to the University of Ilorin — one of Nigeria's most competitive federal universities with over 50,000 students enrolled.",

  // ── Enugu (pink) ───────────────────────────────────────────────────────
  // pos 11: Enugu
  11: "Enugu means 'Top of the Hill' in Igbo. Founded as a coal-mining town in 1909, it served as the capital of the Eastern Region and later the Republic of Biafra during the Nigerian Civil War (1967–70).",
  // pos 13: Udi
  13: "Udi is home to Nigeria's first commercial coal mine, opened in 1915 by the British colonial government. The Udi Hills are the highest point in eastern Nigeria, rising over 300 metres.",
  // pos 14: Nsukka
  14: "Nsukka hosts the University of Nigeria — the first fully autonomous university in Nigeria, founded in 1960. Chimamanda Ngozi Adichie, author of 'Half of a Yellow Sun,' grew up here.",

  // ── Kaduna (orange) ────────────────────────────────────────────────────
  // pos 16: Kaduna
  16: "Kaduna was named after the crocodiles ('kada') in its river. It served as the political capital of northern Nigeria during the colonial era and houses one of Nigeria's four oil refineries.",
  // pos 18: Zaria
  18: "Zaria (originally Zazzau) is one of the original seven Hausa city-states, founded around 1000 AD. Ahmadu Bello University, located here, is the largest university in sub-Saharan Africa by land area.",
  // pos 19: Kafanchan
  19: "Kafanchan is southern Kaduna's key railway junction, where the eastern and western rail lines converge. Its name means 'Where it settles' in Jaba language, and it's a hub of ethnic diversity.",

  // ── Edo (red) ──────────────────────────────────────────────────────────
  // pos 21: Benin City
  21: "Benin City was the heart of the mighty Benin Empire (1180–1897), famed for its bronze sculptures. The Benin Moat, at over 16,000 km total, was the largest man-made earthwork before the mechanical era.",
  // pos 23: Auchi
  23: "Auchi is home to Auchi Polytechnic, one of Nigeria's oldest and largest polytechnics, founded in 1963. The town is a major centre of Etsako culture in northern Edo State.",
  // pos 24: Ekpoma
  24: "Ekpoma hosts Ambrose Alli University, named after the first civilian governor of old Bendel State. The town is a key centre of the Esan people, known for their rich cultural festivals.",

  // ── Rivers (yellow) ────────────────────────────────────────────────────
  // pos 26: Port Harcourt
  26: "Port Harcourt was named after Lewis Harcourt, the British Colonial Secretary, in 1913. Known as the 'Garden City,' it's the hub of Nigeria's multi-billion dollar oil and gas industry.",
  // pos 27: Bonny Island
  27: "Bonny Island hosts Nigeria LNG — one of the world's largest liquefied natural gas plants. The Kingdom of Bonny was one of the most powerful and wealthy trading states in the Niger Delta.",
  // pos 29: Oyigbo
  29: "Oyigbo is a fast-growing industrial town at the crossroads of Rivers and Abia States. A major railway junction, its name derives from the Igbo word meaning 'the people are many.'",

  // ── Abuja (green) ──────────────────────────────────────────────────────
  // pos 31: Maitama, Abuja
  31: "Maitama is one of Abuja's most prestigious districts, home to many embassies and high-end residences. The entire Abuja master plan was designed by Japanese architect Kenzo Tange in 1979.",
  // pos 32: Asokoro, Abuja
  32: "Asokoro houses the Aso Rock Presidential Villa — the official residence of the President of Nigeria. Aso Rock is a 400-metre monolith that dominates the Abuja skyline and gives the villa its name.",
  // pos 34: Wuse, Abuja
  34: "Wuse is the commercial heartbeat of Abuja, featuring Wuse Market — one of the largest open-air markets in West Africa with over 12,000 shops selling everything from textiles to electronics.",

  // ── Lagos (darkblue) ───────────────────────────────────────────────────
  // pos 37: Victoria Island
  37: "Victoria Island (VI) is the financial nerve centre of Nigeria. It hosts the headquarters of most major banks, tech startups, and the Eko Atlantic project — a brand-new coastal city built on reclaimed land from the Atlantic Ocean.",
  // pos 39: Ikoyi
  39: "Ikoyi is one of the most affluent neighbourhoods in Africa, home to the Ikoyi Club (est. 1938) and the iconic Lekki-Ikoyi Link Bridge — a cable-stayed bridge spectacularly lit with LED lights at night.",

  // ── Airports ───────────────────────────────────────────────────────────
  // pos 5: Murtala Muhammed Airport
  5: "Murtala Muhammed International Airport in Lagos is Nigeria's busiest, handling over 9 million passengers annually. Named after General Murtala Muhammed, Nigeria's 4th head of state, who was assassinated in 1976.",
  // pos 15: Nnamdi Azikiwe Airport
  15: "Nnamdi Azikiwe International Airport serves Abuja. Named after Nigeria's first President ('Zik of Africa'), it features a distinctive eagle-shaped terminal roof visible from the air.",
  // pos 25: Port Harcourt Airport
  25: "Port Harcourt International Airport is located in Omagwa, Rivers State. It serves as the main gateway to Nigeria's oil-rich Niger Delta region and was significantly expanded in 2006.",
  // pos 35: Mallam Aminu Kano Airport
  35: "Mallam Aminu Kano International Airport was once a major refuelling stop for transatlantic flights before the jet age. Named after a beloved Hausa political reformer who championed the talakawa (common people).",

  // ── Utilities ──────────────────────────────────────────────────────────
  // pos 12: NEPA
  12: "NEPA (National Electric Power Authority) was Nigeria's electricity monopoly from 1972 to 2005. Nigerians jokingly say NEPA stands for 'Never Expect Power Always' — a nod to the country's infamous power outages.",
  // pos 28: NAFDAC
  28: "NAFDAC was established in 1993 to safeguard Nigerian food and drug safety. Under Director-General Prof. Dora Akunyili (2001–2008), the agency destroyed over ₦23 billion worth of counterfeit drugs and became a symbol of fearless public service.",
};

// ─── General Trivia — Split into two themed decks ───────────────────────────

/**
 * Language, arts, food, music, pop-culture, and daily-life facts about Nigeria.
 */
export const LANGUAGE_CULTURE_TRIVIA: string[] = [
  "Nigeria has over 520 spoken languages, making it one of the most linguistically diverse countries on Earth.",
  "Nollywood produces roughly 2,500 films per year, making it the second-largest film industry in the world by volume — behind only India's Bollywood.",
  "Jollof rice is so beloved that Nigeria and Ghana have a long-running, good-natured rivalry over who makes the best version.",
  "Fela Kuti invented Afrobeat in Lagos in the late 1960s by fusing Yoruba music, jazz, funk, and highlife into a revolutionary new genre.",
  "Wole Soyinka, from Abeokuta, became the first African to win the Nobel Prize in Literature in 1986.",
  "Pidgin English is the most widely spoken lingua franca in Nigeria, understood by over 75 million people across all regions.",
  "Suya — spiced grilled meat on skewers — is Nigeria's most popular street food, enjoyed across the entire country from north to south.",
  "Indomie instant noodles are so popular in Nigeria that 'Indomie' has become a generic word for all noodles, regardless of brand.",
  "The Yoruba people have one of the highest rates of twin births in the world, particularly in the town of Igbo-Ora, called 'Twin Capital of the World.'",
  "Burna Boy's 2021 Grammy win for 'Twice as Tall' was a landmark moment for Nigerian music, followed by Wizkid and Tems' wins, putting Afrobeats on the global map.",
  "Calabar Carnival, held every December, is called 'Africa's biggest street party' and attracts over 2 million visitors annually.",
  "The word 'Odogwu' (used in this game's title!) is Igbo for 'big man' or 'boss' — a term of respect and admiration for someone successful.",
  "Aso Oke, a hand-loomed cloth woven by the Yoruba, is Nigeria's most prestigious ceremonial fabric, worn at weddings and chieftaincy events.",
];

/**
 * History, geography, economy, and infrastructure facts about Nigeria.
 */
export const HISTORY_GEOGRAPHY_TRIVIA: string[] = [
  "Nigeria has the largest population of any African country — over 220 million people as of 2023, roughly 1 in 6 Africans.",
  "Lagos is the largest city in Africa by population, with over 21 million people in its metropolitan area.",
  "Nigeria's GDP is the largest in Africa — it officially overtook South Africa in 2014 after a statistical rebasing exercise.",
  "The Nigerian Naira (₦) was introduced in 1973, replacing the Nigerian Pound at a rate of 2 Naira = 1 Pound.",
  "Nigeria was the first country in Africa to launch a communications satellite — NigComSat-1 in 2007.",
  "The Niger River, from which Nigeria gets its name, is the third-longest river in Africa at 4,180 kilometres.",
  "The Third Mainland Bridge in Lagos is the longest bridge in Africa at 11.8 kilometres, connecting the Island to the Mainland.",
  "Nigeria's Super Eagles have qualified for six FIFA World Cups — more than any other African nation.",
  "Nigeria won Olympic gold in football at the 1996 Atlanta Games — the first African team ever to achieve this feat.",
  "Aliko Dangote, from Kano, is the richest person in Africa. He built his fortune in cement, sugar, and flour manufacturing.",
  "The ancient Nok civilisation, in modern-day Kaduna and Plateau States, produced terracotta sculptures dating back to 500 BC — among the oldest in sub-Saharan Africa.",
  "Aso Rock, the 400-metre granite monolith in Abuja, is one of Nigeria's most recognisable landmarks and sits right behind the Presidential Villa.",
  "The Lekki Conservation Centre features the longest canopy walkway in Africa, stretching 401 metres through coastal mangrove forest.",
  "Nigeria's National Youth Service Corps (NYSC) was established in 1973 — every university graduate must serve for one year in a state different from their own.",
  "The Benin Bronzes, created by the Edo people as far back as the 13th century, are among the most celebrated artworks in African history.",
];

// ─── Combined pool (for contexts where we don't need to filter) ─────────────

/** All general trivia combined from both decks. */
export const ALL_TRIVIA: string[] = [
  ...LANGUAGE_CULTURE_TRIVIA,
  ...HISTORY_GEOGRAPHY_TRIVIA,
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Get a fact for a tile by its board position. Returns undefined for non-ownable tiles. */
export const getFactForTile = (pos: number): string | undefined =>
  PROPERTY_FACTS[pos];
