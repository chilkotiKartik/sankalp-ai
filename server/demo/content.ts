import type { ComplaintCategory, PatrolVan, Announcement, Poll, Petition, CivicEvent, RTIRequest } from "../types";

import { randomUUID as genId } from "node:crypto";

const rndInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

/** DEMO-ONLY content (P0.a). Never loaded unless DEMO_MODE=true. */

export const WORKER_NAMES = [
  "Ramesh Negi","Gopal Bisht","Pushpa Rawat","Suresh Rana","Anita Devi",
  "Vikram Panwar","Meena Mehta","Mohan Joshi","Kavita Bora","Deepak Kunwar",
  "Sunita Adhikari","Ravi Bhandari","Pooja Mahar","Arun Rikhola","Geeta Semwal",
  "Sanjay Nautiyal","Rekha Chauhan","Lokesh Dobhal","Shashi Kala","Prakash Tamta",
  "Dinesh Ghildiyal","Hema Kandpal","Bijendra Singh","Lalita Pant","Naresh Tolia",
  "Seema Lingwal","Bhupesh Maithani","Kamla Sajwan","Trilok Rana","Usha Bhatt",
];

export const COMPLAINT_DESCS: Record<ComplaintCategory, string[]> = {
  pothole: [
    "Large pothole on Badrinath highway causing accidents, vehicles getting damaged",
    "Deep crater near government school gate, children at serious risk",
    "Multiple potholes on hospital road, patient transport hampered",
    "Road completely broken near bus stand, flooding during rain",
    "Two-wheeler accident due to hidden pothole on mountain road",
    "Pothole 3ft wide near market junction blocking traffic on hill road",
  ],
  garbage: [
    "Garbage not collected for 7 days near market area, creating health hazard",
    "Overflowing municipality dustbin near primary school",
    "Illegal garbage dump near residential colony on hillside",
    "Construction waste dumped on public footpath near river",
    "Burning garbage creating toxic smoke near residential area",
    "Abandoned garbage near tourist area damaging Uttarakhand's image",
  ],
  streetlight: [
    "Street lights non-functional for 3 weeks, area unsafe at night on mountain road",
    "Single working light in 500m stretch, residents afraid to walk",
    "Lights sparking dangerously near children's park",
    "New LED poles installed but never switched on",
    "Lights malfunction — running all day, off at night",
    "Multiple broken lights causing accidents on dark mountain curve",
  ],
  water: [
    "No water supply for 5 days in summer, valley residents suffering",
    "Brown dirty water flowing from taps due to pipeline damage in landslide",
    "Pipeline burst flooding village road for 48 hours",
    "Water pressure critically low — upper floor residents getting nothing",
    "Sewage mixing with drinking water, disease risk in densely populated area",
    "Water tanker not arriving despite request, senior citizens suffering",
  ],
  drain: [
    "Clogged drain flooding market area after 10 minutes of rain",
    "Sewage overflow entering homes, furniture damaged",
    "Open drain near primary school breeding dengue mosquitoes",
    "Blocked storm drain causing road waterlogging since monsoon",
    "Drain wall collapsed, children have fallen in twice",
    "Raw sewage smell making entire market area unbearable",
  ],
  electricity: [
    "Power cuts 8-10 hours daily due to transformer fault",
    "Transformer sparking visibly, entire village at risk",
    "Exposed high-voltage wire fallen on footpath after landslide",
    "Electricity bill paid but supply disconnected wrongly",
    "Short circuit causing fires, 3 incidents in one week",
    "Meter tampering by officials causing inflated bills",
  ],
  tree: [
    "Massive dead tree leaning over house after storm, will fall any day",
    "Fallen tree blocking main road connecting two villages",
    "Tree roots breaking water main pipe, water loss in colony",
    "Hanging branch over school compound wall, child safety risk",
    "Tree fell on parked vehicles during storm, no response from authorities",
    "Uprooted tree blocking only access footpath in hilly area",
  ],
  road_damage: [
    "Entire road surface broken after monsoon flooding, vehicles cannot pass",
    "Bridge road damaged with cracks, heavy vehicles advised to avoid",
    "Mountain highway shoulder has collapsed, one-lane road extremely dangerous",
    "Storm washed away road surface near village, ambulance route cut",
    "Road sinkhole appeared overnight, 3-feet deep near bus stop",
    "Landslide debris still blocking half of NH-58, traffic jams 5km",
  ],
  sewage: [
    "Sewage line overflowing onto footpath for 4 days, unbearable smell",
    "Manhole cover missing on main road, open sewage exposing residents",
    "Sewage leaking into drinking water supply, disease risk in colony",
    "Underground sewage pipe burst near market, flooding footpaths",
    "Old sewage drain collapsed, contents spilling on residential street",
    "Sewage treatment plant overflow entering river, environmental hazard",
  ],
  transformer: [
    "Transformer burnt last night, 400 homes without power for 2 days",
    "Oil leaking from transformer near school, fire hazard",
    "Transformer sparking loudly, entire neighborhood afraid to sleep",
    "Old transformer overloaded — trips 6-7 times daily, appliances damaged",
    "Transformer pole tilted after rain, could fall on road",
    "No transformer installed in new colony despite 6 months of payment",
  ],
  noise: [
    "Illegal loudspeakers running till 3 AM near residential area daily",
    "Construction drilling from 5 AM disrupting sleep and exams",
    "Commercial generator running 24/7 next to homes — 85 decibels",
    "Pub playing loud music till midnight in residential zone",
    "Temple festival loudspeaker causing noise beyond 10 PM limit",
    "Factory noise and vibration cracking walls of nearby houses",
  ],
  health_hazard: [
    "Dead animals on main road for 3 days, disease outbreak risk",
    "Illegal slaughterhouse waste dumped in river causing contamination",
    "Stagnant water breeding dengue mosquitoes near primary school",
    "Food stall operating without hygiene — students falling ill",
    "Chemical waste dumped near water body, strong toxic smell",
    "Mass rat infestation in market area destroying food stocks",
  ],
  disaster: [
    "Landslide has blocked the only road to our village for 2 days",
    "Heavy flooding in low-lying area, 20 families need evacuation",
    "Hill slope showing cracks after heavy rain — landslide imminent",
    "Flash flood destroyed agricultural land, farmers need emergency help",
    "Bridge cracked due to excessive water flow — unsafe to cross",
    "Mountain stream overflowing due to cloudburst, road cut off",
  ],
  other: [
    "Stray dogs attacking residents at night regularly in colony",
    "Broken footpath tiles on main market road causing injury to elderly",
    "Unauthorized encroachment on forest land near village boundary",
    "Abandoned vehicle blocking emergency access near hospital",
    "Landslide debris on road not cleared for 2 days",
    "Public toilet broken and overflowing near tourist spot",
  ],
};

export const LOCATIONS_PREFIX = [
  "Near Bus Stand", "Main Bazar", "Block Road", "Colony Gate",
  "Hospital Road", "School Road", "Park Area", "Market Junction",
  "Railway Bridge", "Temple Road", "Residential Colony", "Market Chowk",
  "Near Forest Range Office", "NH-58 Bypass", "River Bridge Road",
];

export const PATROL_VANS_SEED: PatrolVan[] = [
  { id: "pv001", vanNumber: "UK07-CPR-001", officerInCharge: "SI Anil Kumar", officerPhone: "9000000001", crewCount: 3, district: "Dehradun", zone: "Clock Tower-Rajpur Road", status: "active_patrol", geo: { lat: 30.3165, lng: 78.0322 }, shift: "day", isWomenSafetyUnit: false },
  { id: "pv002", vanNumber: "UK07-CPR-002", officerInCharge: "SI Priya Rana", officerPhone: "9000000002", crewCount: 3, district: "Dehradun", zone: "Clement Town-Ballupur", status: "active_patrol", geo: { lat: 30.2880, lng: 78.0450 }, shift: "night", isWomenSafetyUnit: true },
  { id: "pv003", vanNumber: "UK01-CPR-003", officerInCharge: "SI Mohan Singh", officerPhone: "9000000003", crewCount: 4, district: "Haridwar", zone: "Har Ki Pauri-Jwalapur", status: "base", geo: { lat: 29.9457, lng: 78.1642 }, shift: "day", isWomenSafetyUnit: false },
  { id: "pv004", vanNumber: "UK05-CPR-004", officerInCharge: "SI Neha Bisht", officerPhone: "9000000004", crewCount: 3, district: "Nainital", zone: "Mall Road-Tallital", status: "active_patrol", geo: { lat: 29.3909, lng: 79.4542 }, shift: "day", isWomenSafetyUnit: true },
  { id: "pv005", vanNumber: "UK06-CPR-005", officerInCharge: "SI Ravi Joshi", officerPhone: "9000000005", crewCount: 3, district: "Udham Singh Nagar", zone: "Rudrapur Central", status: "active_patrol", geo: { lat: 29.0293, lng: 79.4661 }, shift: "day", isWomenSafetyUnit: false },
  { id: "pv006", vanNumber: "UK03-CPR-006", officerInCharge: "SI Kavita Panwar", officerPhone: "9000000006", crewCount: 3, district: "Almora", zone: "Mall Road-Lala Bazaar", status: "active_patrol", geo: { lat: 29.5971, lng: 79.6460 }, shift: "night", isWomenSafetyUnit: true },
  { id: "pv007", vanNumber: "UK09-CPR-007", officerInCharge: "SI Deepak Negi", officerPhone: "9000000007", crewCount: 4, district: "Pithoragarh", zone: "Pithoragarh Town", status: "base", geo: { lat: 29.5829, lng: 80.2176 }, shift: "day", isWomenSafetyUnit: false },
  { id: "pv008", vanNumber: "UK08-CPR-008", officerInCharge: "SI Sunita Rawat", officerPhone: "9000000008", crewCount: 3, district: "Chamoli", zone: "Gopeshwar-Joshimath", status: "active_patrol", geo: { lat: 30.3990, lng: 79.3205 }, shift: "day", isWomenSafetyUnit: false },
  { id: "pv009", vanNumber: "UK02-CPR-009", officerInCharge: "SI Harish Bartwal", officerPhone: "9000000009", crewCount: 4, district: "Uttarkashi", zone: "Town Area-Gangotri Road", status: "active_patrol", geo: { lat: 30.7268, lng: 78.4354 }, shift: "night", isWomenSafetyUnit: false },
  { id: "pv010", vanNumber: "UK07-CPR-010", officerInCharge: "SI Meena Thakur", officerPhone: "9000000010", crewCount: 3, district: "Dehradun", zone: "Prem Nagar-Selaqui", status: "off_duty", geo: { lat: 30.3565, lng: 77.9900 }, shift: "day", isWomenSafetyUnit: true },
  { id: "pv011", vanNumber: "UK04-CPR-011", officerInCharge: "SI Ramesh Dobhal", officerPhone: "9000000011", crewCount: 4, district: "Tehri Garhwal", zone: "Tehri-Devprayag", status: "active_patrol", geo: { lat: 30.3912, lng: 78.4803 }, shift: "day", isWomenSafetyUnit: false },
  { id: "pv012", vanNumber: "UK01-CPR-012", officerInCharge: "SI Anita Nautiyal", officerPhone: "9000000012", crewCount: 3, district: "Haridwar", zone: "BHEL-Sidcul", status: "active_patrol", geo: { lat: 29.9820, lng: 78.1100 }, shift: "night", isWomenSafetyUnit: true },
  { id: "pv013", vanNumber: "UK11-CPR-013", officerInCharge: "SI Bhavna Rawat", officerPhone: "9000000013", crewCount: 3, district: "Rudraprayag", zone: "Rudraprayag Town-Agastmuni", status: "active_patrol", geo: { lat: 30.2847, lng: 78.9816 }, shift: "day", isWomenSafetyUnit: true },
  { id: "pv014", vanNumber: "UK10-CPR-014", officerInCharge: "SI Suresh Panwar", officerPhone: "9000000014", crewCount: 4, district: "Pauri Garhwal", zone: "Pauri-Kotdwar Highway", status: "active_patrol", geo: { lat: 30.1455, lng: 78.7756 }, shift: "day", isWomenSafetyUnit: false },
  { id: "pv015", vanNumber: "UK12-CPR-015", officerInCharge: "SI Geeta Rana", officerPhone: "9000000015", crewCount: 3, district: "Champawat", zone: "Champawat-Tanakpur Road", status: "active_patrol", geo: { lat: 29.3333, lng: 80.0905 }, shift: "day", isWomenSafetyUnit: true },
  { id: "pv016", vanNumber: "UK13-CPR-016", officerInCharge: "SI Dinesh Mahar", officerPhone: "9000000016", crewCount: 3, district: "Bageshwar", zone: "Bageshwar Town-Kapkot", status: "active_patrol", geo: { lat: 29.8380, lng: 79.7700 }, shift: "night", isWomenSafetyUnit: false },
  { id: "pv017", vanNumber: "UK07-CPR-017", officerInCharge: "SI Naina Bisht", officerPhone: "9000000017", crewCount: 3, district: "Dehradun", zone: "ISBT-Saharanpur Road", status: "active_patrol", geo: { lat: 30.2980, lng: 78.0520 }, shift: "night", isWomenSafetyUnit: true },
  { id: "pv018", vanNumber: "UK01-CPR-018", officerInCharge: "SI Rajesh Thapli", officerPhone: "9000000018", crewCount: 4, district: "Haridwar", zone: "Rishikesh-Shyampur", status: "active_patrol", geo: { lat: 29.9582, lng: 78.2143 }, shift: "day", isWomenSafetyUnit: false },
];

export function demoAnnouncements(): Omit<Announcement, "id" | "postedAt" | "views">[] {
  return [
      {
        title: "PM Awas Yojana — Uttarakhand Housing Applications Open",
        body: "Uttarakhand Government invites applications for affordable housing under PM Awas Yojana Urban 2.0. Eligible families with annual income below ₹18 lakh can apply at district collector offices or online at ukhfdc.com. Last date: 31 March 2026.",
        type: "scheme", department: "Uttarakhand Housing Development & Construction Unit", priority: "important", postedBy: "SANKALP Super Admin"
      },
      {
        title: "Free Eye Checkup Camp — Champawat District",
        body: "Uttarakhand Health Department organising free eye checkup and spectacle distribution camps in Champawat. Venue: District Hospital Champawat. Timings: 9 AM–4 PM. Bring Aadhaar card.",
        type: "welfare", department: "Uttarakhand Health Department", priority: "important", postedBy: "SANKALP Super Admin", targetDistrict: "Champawat"
      },
      {
        title: "Uttarakhand Mukhyamantri Swarojgar Yojana 2026",
        body: "Apply for self-employment loans under CM Swarojgar Yojana. Subsidy of 25% up to ₹2 lakh for mountain residents. Visit district magistrate office or apply at cm.uk.gov.in.",
        type: "scheme", department: "District Industries Centre, Uttarakhand", priority: "urgent", postedBy: "SANKALP Super Admin"
      },
      {
        title: "Water Supply Disruption — Dehradun City",
        body: "Due to emergency pipeline repair work, water supply will remain disrupted in parts of Dehradun from 10 PM to 6 AM tonight. Water tankers will be deployed at designated points. Contact 1916.",
        type: "emergency", department: "Uttarakhand Jal Sansthan", priority: "urgent", postedBy: "Dehradun Admin", targetDistrict: "Dehradun"
      },
      {
        title: "Landslide Alert — Heavy Rain Warning for Hill Districts",
        body: "IMD has issued Orange Alert for heavy rainfall in Chamoli, Rudraprayag, Uttarkashi and Tehri districts. Citizens are advised to stay away from landslide-prone areas. Emergency helpline: 1070.",
        type: "emergency", department: "Uttarakhand Disaster Management Authority", priority: "urgent", postedBy: "SANKALP Super Admin"
      },
      {
        title: "Veer Chandra Singh Garhwali Paryatan Vikas Yojana",
        body: "Uttarakhand Tourism Department invites applications from villagers to develop eco-tourism homestays. Grant of ₹5 lakh available. Visit tourism.uk.gov.in or nearest ITDC office.",
        type: "scheme", department: "Uttarakhand Tourism Development Board", priority: "important", postedBy: "SANKALP Super Admin"
      },
      {
        title: "Ration Card Correction Drive — All Districts",
        body: "Uttarakhand Food & Civil Supplies Department is conducting a special ration card correction and Aadhaar seeding drive. Citizens can get names added/corrected at tehsil offices. Documents needed: Aadhaar, old ration card, address proof. Drive runs from 1st to 31st of this month.",
        type: "welfare", department: "Uttarakhand Food & Civil Supplies Department", priority: "important", postedBy: "SANKALP Super Admin"
      },
      {
        title: "Uttarakhand Board Result 2025 — Class 10 & 12 Declared",
        body: "Uttarakhand Board of School Education (UBSE) has declared class 10 and 12 results for 2025. Pass percentage: Class 10 — 82.3%, Class 12 — 79.6%. Students can check results at ubse.uk.gov.in. Merit certificates to be issued within 30 days. Helpline: 0135-2674117.",
        type: "general", department: "Uttarakhand Board of School Education", priority: "important", postedBy: "SANKALP Super Admin"
      },
      {
        title: "Gas Cylinder Home Delivery — Apply Online Now",
        body: "Uttarakhand residents in remote hill areas can now register for home delivery of LPG cylinders under Pradhan Mantri Ujjwala Yojana. Apply at pmuy.gov.in or at nearest Common Service Centre. Priority for BPL families and women-headed households. Subsidy continues: ₹300 per cylinder for eligible beneficiaries.",
        type: "scheme", department: "Ministry of Petroleum & Natural Gas, UK Nodal Office", priority: "normal", postedBy: "SANKALP Super Admin"
      },
      {
        title: "Road Closure — Rishikesh–Badrinath Highway Repair",
        body: "Due to emergency road repair work after monsoon damage, the Rishikesh–Badrinath National Highway (NH-58) will remain closed for heavy vehicles from Devprayag to Srinagar on Tuesdays and Thursdays (9 AM – 5 PM). Light vehicles and pilgrim buses will be allowed via alternate route. Helpline: 1800-180-4247.",
        type: "emergency", department: "National Highways Authority of India (NHAI)", priority: "urgent", postedBy: "SANKALP Super Admin"
      },
      {
        title: "MGNREGA 100-Day Work Guarantee — Register Now",
        body: "All rural households of Uttarakhand can register for MGNREGA employment guarantee. 100 days of guaranteed wage employment per year. Daily wage: ₹230–₹250 for Uttarakhand (varies by district). Register at your Gram Panchayat or online at nregastrep.nic.in. Priority work includes road maintenance, tree plantation, water conservation.",
        type: "scheme", department: "Rural Development Department, Uttarakhand", priority: "normal", postedBy: "SANKALP Super Admin"
      },
      {
        title: "Holiday Notice — Uttarakhand Sthapna Diwas (9 November)",
        body: "9 November is a public holiday in Uttarakhand on account of Uttarakhand Sthapna Diwas (State Foundation Day). All government offices, banks, schools, and courts will remain closed. Emergency services will continue. State-level cultural events to be held at Parade Ground, Dehradun from 10 AM.",
        type: "holiday", department: "Uttarakhand General Administration Department", priority: "normal", postedBy: "SANKALP Super Admin"
      },
      {
        title: "Tender Notice — LED Streetlight Upgrade Haridwar",
        body: "Haridwar Urban Local Body invites sealed tenders from registered contractors for supply and installation of 2,400 LED streetlights across Haridwar Municipal area. Bid document available at HUL office, Civil Lines, Haridwar. Submission deadline: 15 days from notice date. EMD: ₹2 lakh. Helpline: 01334-225600.",
        type: "tender", department: "Haridwar Urban Local Body", priority: "normal", postedBy: "Haridwar Admin", targetDistrict: "Haridwar"
      },
  ];
}

export function demoPolls(): Omit<Poll, "id">[] {
  return [
      { question: "Which area needs urgent road repair in Dehradun?", options: ["Rajpur Road", "Sahastradhara Road", "Haridwar Road", "Rispana Bridge area"], votes: [45, 32, 28, 19], voterIds: [], district: "Dehradun", createdAt: new Date(Date.now() - 2 * 86400000).toISOString(), createdBy: "Dehradun Admin", status: "active" },
      { question: "Should we extend garbage collection to Sundays?", options: ["Yes, strongly agree", "No, weekdays are enough", "Need more dustbins first"], votes: [128, 34, 67], voterIds: [], createdAt: new Date(Date.now() - 5 * 86400000).toISOString(), createdBy: "SANKALP Super Admin", status: "active" },
      { question: "Rate the water supply quality in your area", options: ["Excellent", "Good", "Average", "Poor", "Very Poor"], votes: [12, 38, 56, 41, 23], voterIds: [], district: "Haridwar", createdAt: new Date(Date.now() - 3 * 86400000).toISOString(), createdBy: "Haridwar Admin", status: "active" },
      { question: "Which civic service needs most improvement?", options: ["Street Lighting", "Garbage Collection", "Road Repair", "Water Supply", "Drainage"], votes: [55, 72, 98, 61, 44], voterIds: [], createdAt: new Date(Date.now() - 7 * 86400000).toISOString(), createdBy: "SANKALP Super Admin", status: "active" },
  ];
}

export function demoPetitions(): Omit<Petition, "id">[] {
  return [
      { title: "Install Speed Breakers Near Government School Dehradun", description: "Children's safety at risk due to speeding vehicles near Govt Inter College Dehradun. We demand immediate installation of speed breakers and zebra crossings at all 3 entry/exit points of the school.", target: "PWD Department & District Administration, Dehradun", goalSignatures: 500, signerIds: Array(312).fill("").map(() => genId()), district: "Dehradun", createdAt: new Date(Date.now() - 10 * 86400000).toISOString(), createdBy: "Ramesh Kumar Rawat", status: "active", department: "Public Works Department" },
      { title: "Fix Broken Street Lights on Haridwar Bypass", description: "Over 40 street lights on the Haridwar Bypass have been non-functional for 3+ months. This is a major safety hazard, especially for women walking at night. We demand immediate repair.", target: "ULB Electric Wing, Haridwar", goalSignatures: 1000, signerIds: Array(647).fill("").map(() => genId()), district: "Haridwar", createdAt: new Date(Date.now() - 15 * 86400000).toISOString(), createdBy: "Priya Bisht", status: "active", department: "Urban Local Body" },
      { title: "Open Health Sub-Centre in Agastmuni Block", description: "Residents of Agastmuni have to travel 25 km to Rudraprayag for basic healthcare. We demand a fully functional health sub-centre with doctor and medicine facilities in our block.", target: "Uttarakhand Health Department", goalSignatures: 750, signerIds: Array(189).fill("").map(() => genId()), district: "Rudraprayag", createdAt: new Date(Date.now() - 20 * 86400000).toISOString(), createdBy: "Asha Devi", status: "active", department: "Health Department" },
      { title: "Ban Plastic Bags in Nainital Market", description: "Naini Lake is being polluted by single-use plastic. We urge the district administration to strictly enforce the plastic ban in Nainital market and tourist areas with heavy fines.", target: "Nainital District Administration", goalSignatures: 2000, signerIds: Array(1823).fill("").map(() => genId()), district: "Nainital", createdAt: new Date(Date.now() - 8 * 86400000).toISOString(), createdBy: "Amit Negi", status: "active", department: "Environment Department" },
  ];
}

export function demoEvents(): Omit<CivicEvent, "id">[] {
    const futureDate = (days: number) => {
      const d = new Date(Date.now() + days * 86400000);
      return d.toISOString().split("T")[0];
    };
  return [
      { title: "Free Health Camp — Haridwar District", description: "Free general health checkup, blood pressure, sugar, eye testing and dental checkup for all citizens. Medicines provided free of cost. Bring Aadhaar card.", date: futureDate(3), time: "9:00 AM – 4:00 PM", location: "District Hospital, Haridwar", type: "camp", district: "Haridwar", rsvpIds: Array(78).fill("").map(() => genId()), organizer: "Uttarakhand Health Dept", createdAt: new Date().toISOString() },
      { title: "Ward Committee Meeting — Dehradun East", description: "Monthly citizen grievance redressal meeting with ward officer. Bring your pending complaint tickets for direct resolution. All residents welcome.", date: futureDate(5), time: "11:00 AM – 1:00 PM", location: "Ward Office, Raipur Block, Dehradun", type: "meeting", district: "Dehradun", rsvpIds: Array(34).fill("").map(() => genId()), organizer: "Dehradun Admin", createdAt: new Date().toISOString() },
      { title: "Swachh Bharat Drive — Nainital Lake Cleanup", description: "Join us in cleaning the banks of Naini Lake. Gloves and bags provided. Earn 50 SANKALP civic points for participating. All age groups welcome.", date: futureDate(7), time: "7:00 AM – 10:00 AM", location: "Naini Lake Boat Club, Nainital", type: "drive", district: "Nainital", rsvpIds: Array(112).fill("").map(() => genId()), organizer: "Nainital Admin", createdAt: new Date().toISOString() },
      { title: "PM Awas Yojana Registration Drive", description: "Government camp for registering beneficiaries for PM Awas Yojana urban housing scheme. Income below ₹18L. Bring Aadhaar, income certificate, land documents.", date: futureDate(10), time: "10:00 AM – 5:00 PM", location: "Collectorate Office, Dehradun", type: "scheme", district: "Dehradun", rsvpIds: Array(203).fill("").map(() => genId()), organizer: "Dehradun Admin", createdAt: new Date().toISOString() },
      { title: "Tree Plantation Drive — Uttarkashi Hills", description: "Forest Department invites volunteers to plant 5000 saplings on degraded hillside. Transportation provided from Uttarkashi town. Certificate given to all volunteers.", date: futureDate(14), time: "8:00 AM – 3:00 PM", location: "Forest Range Office, Uttarkashi", type: "drive", district: "Uttarkashi", rsvpIds: Array(45).fill("").map(() => genId()), organizer: "Forest Department, Uttarkashi", createdAt: new Date().toISOString() },
      { title: "SANKALP AI Town Hall — All Districts", description: "State-level town hall on civic infrastructure improvement. Citizens can directly address district officers. Live broadcast. Attend in person or online.", date: futureDate(20), time: "3:00 PM – 6:00 PM", location: "Raj Bhavan Auditorium, Dehradun (+ Online)", type: "meeting", rsvpIds: Array(567).fill("").map(() => genId()), organizer: "SANKALP Super Admin", createdAt: new Date().toISOString() },
  ];
}

export const DEMO_BUDGET = [
      { department: "Public Works Department", category: "Road Repair", allocated: 8500, spent: 6200, description: "National and state highway pothole repairs and resurfacing" },
      { department: "Uttarakhand Jal Sansthan", category: "Water Infrastructure", allocated: 5200, spent: 4100, description: "Pipeline replacement, bore wells, water treatment plant upgrade" },
      { department: "Urban Local Body", category: "Solid Waste Management", allocated: 3800, spent: 2900, description: "Garbage trucks, sweeping machines, landfill management" },
      { department: "ULB Electric Wing", category: "Street Lighting", allocated: 2400, spent: 1800, description: "LED street light installation and maintenance across wards" },
      { department: "Forest Department", category: "Green Cover", allocated: 1600, spent: 900, description: "Tree plantation, hill slope stabilization, eco-parks" },
      { department: "Health Department", category: "Primary Health", allocated: 4500, spent: 3200, description: "PHC upgrades, medicine stock, health camps, ambulances" },
      { department: "UPCL", category: "Power Infrastructure", allocated: 6100, spent: 5400, description: "Transformer upgrades, last-mile connectivity, smart metering" },
      { department: "Disaster Management", category: "Emergency Preparedness", allocated: 2800, spent: 1400, description: "Landslide barriers, flood early warning, rescue equipment" },
];

export const DEMO_BUDGET_SCALE: Record<string, { alloc: number; spent: number }> = {
      "Dehradun":         { alloc: 1.40, spent: 1.30 },
      "Haridwar":         { alloc: 1.20, spent: 1.08 },
      "Nainital":         { alloc: 1.00, spent: 0.88 },
      "Udham Singh Nagar":{ alloc: 1.10, spent: 0.96 },
      "Almora":           { alloc: 0.75, spent: 0.62 },
      "Pithoragarh":      { alloc: 0.70, spent: 0.55 },
      "Champawat":        { alloc: 0.55, spent: 0.42 },
      "Bageshwar":        { alloc: 0.50, spent: 0.36 },
      "Tehri Garhwal":    { alloc: 0.80, spent: 0.65 },
      "Pauri Garhwal":    { alloc: 0.72, spent: 0.58 },
      "Rudraprayag":      { alloc: 0.60, spent: 0.44 },
      "Chamoli":          { alloc: 0.65, spent: 0.50 },
      "Uttarkashi":       { alloc: 0.62, spent: 0.47 },
};

export function demoRTIs(): Omit<RTIRequest, "id">[] {
  return [
      { ticketId: `RTI-UK-${rndInt(10000, 99999)}`, subject: "Status of road repair work on Rajpur Road", description: "I am a resident of Rajpur Road, Dehradun. I request information on the status of road repair work sanctioned in 2024-25 budget, total expenditure incurred, contractor details and expected completion date.", department: "Public Works Department", filedBy: "Arjun", filedByPhone: "9000000001", filedAt: new Date(Date.now() - 15 * 86400000).toISOString(), status: "acknowledged", district: "Champawat", deadline: new Date(Date.now() + 15 * 86400000).toISOString() },
  ];
}
