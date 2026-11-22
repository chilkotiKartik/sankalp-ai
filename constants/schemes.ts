import type { Ionicons } from "@expo/vector-icons";

/**
 * Central Government schemes available in every state and UT. Facts are kept to what the official
 * scheme portals state; amounts and rules change, so every card links to the official site and the
 * app tells the user to confirm there before applying. Last reviewed: 2026-11.
 */
export interface Scheme {
  key: string; title: string; sub: string; tag: string; color: string; icon: keyof typeof Ionicons.glyphMap;
  fullTitle: string; tagline: string; eligibility: string[]; benefits: string[]; howToApply: string;
  helpline: string; website: string; states?: string[];
}

export const NATIONAL_SCHEMES: Scheme[] = [
  {
    key: "pmkisan", title: "PM-KISAN", sub: "₹6,000 a year for farmer families", tag: "FARMERS", color: "#16A34A", icon: "leaf",
    fullTitle: "Pradhan Mantri Kisan Samman Nidhi (PM-KISAN)", tagline: "Income support paid directly to farmers' bank accounts",
    eligibility: [
      "Landholding farmer families (husband, wife and minor children)",
      "Land records in the family's name, and an Aadhaar-seeded bank account",
      "Excluded: income-tax payers, constitutional post holders, serving or retired government officers, and registered professionals such as doctors and lawyers",
    ],
    benefits: ["₹6,000 per year, paid in three instalments of ₹2,000", "Paid by direct benefit transfer to the bank account"],
    howToApply: "Register on pmkisan.gov.in (New Farmer Registration) or at a Common Service Centre. e-KYC is required.",
    helpline: "155261", website: "pmkisan.gov.in",
  },
  {
    key: "vayvandana", title: "Ayushman Vay Vandana", sub: "Free health cover for everyone aged 70+", tag: "SENIORS", color: "#DC2626", icon: "heart",
    fullTitle: "Ayushman Bharat PM-JAY for senior citizens (Ayushman Vay Vandana Card)", tagline: "Health cover for all citizens aged 70 and above, whatever their income",
    eligibility: ["Every Indian citizen aged 70 years or more", "No income limit"],
    benefits: ["Up to ₹5 lakh a year of cashless hospital treatment per family", "Families already under PM-JAY get an extra top-up for the senior members"],
    howToApply: "Enrol on the Ayushman app or beneficiary.nha.gov.in with Aadhaar, or at an empanelled hospital or Common Service Centre.",
    helpline: "14555", website: "beneficiary.nha.gov.in",
  },
  {
    key: "ujjwala", title: "PM Ujjwala Yojana", sub: "Free LPG connection for poor households", tag: "WOMEN", color: "#EA580C", icon: "flame",
    fullTitle: "Pradhan Mantri Ujjwala Yojana (PMUY)", tagline: "Clean cooking gas for women of poor households",
    eligibility: ["Adult woman from a poor household", "No existing LPG connection in the household"],
    benefits: ["Deposit-free LPG connection", "Under PMUY 2.0, the first refill and a stove are also provided free"],
    howToApply: "Apply at the nearest LPG distributor or online at pmuy.gov.in with Aadhaar, ration card and bank details.",
    helpline: "", website: "pmuy.gov.in",
  },
  {
    key: "jansuraksha", title: "Jan Suraksha insurance", sub: "₹2 lakh life and accident cover at low premium", tag: "INSURANCE", color: "#2563EB", icon: "shield-checkmark",
    fullTitle: "PM Jeevan Jyoti Bima Yojana and PM Suraksha Bima Yojana", tagline: "Low-cost life and accident insurance through your bank account",
    eligibility: ["PMJJBY (life): age 18–50 with a bank or post office account", "PMSBY (accident): age 18–70 with a bank or post office account"],
    benefits: ["PMJJBY: ₹2 lakh life cover for ₹436 a year", "PMSBY: ₹2 lakh accidental death or full disability cover (₹1 lakh partial) for ₹20 a year", "Premium is auto-debited once a year"],
    howToApply: "Enrol through your bank branch, net banking, or at your post office.",
    helpline: "", website: "jansuraksha.gov.in",
  },
  {
    key: "apy", title: "Atal Pension Yojana", sub: "Guaranteed pension of ₹1,000–5,000 a month", tag: "PENSION", color: "#7C3AED", icon: "time",
    fullTitle: "Atal Pension Yojana (APY)", tagline: "A guaranteed monthly pension from age 60",
    eligibility: ["Age 18 to 40 with a savings bank or post office account", "Not an income-tax payer (rule from 1 October 2022)"],
    benefits: ["Guaranteed pension of ₹1,000 to ₹5,000 a month from age 60, depending on contribution", "The same pension continues to the spouse, then the corpus goes to the nominee"],
    howToApply: "Open APY through your bank branch or post office; contributions are auto-debited.",
    helpline: "", website: "npscra.nsdl.co.in",
  },
  {
    key: "sukanya", title: "Sukanya Samriddhi", sub: "High-interest savings for a girl child", tag: "GIRL CHILD", color: "#DB2777", icon: "school",
    fullTitle: "Sukanya Samriddhi Yojana (SSY)", tagline: "A savings account for a daughter's education and future",
    eligibility: ["A girl child below 10 years of age", "Up to two accounts per family (three for twins or triplets)"],
    benefits: ["Deposit ₹250 to ₹1.5 lakh a year", "Government-set interest rate, reviewed every quarter", "Deposits qualify for income-tax deduction under section 80C", "Account matures 21 years after opening"],
    howToApply: "Open at any post office or authorised bank with the girl's birth certificate and the parent's ID and address proof.",
    helpline: "", website: "www.indiapost.gov.in",
  },
  {
    key: "vishwakarma", title: "PM Vishwakarma", sub: "Training, toolkit and loans for artisans", tag: "ARTISANS", color: "#B45309", icon: "hammer",
    fullTitle: "PM Vishwakarma", tagline: "Support for traditional artisans and craftspeople in 18 trades",
    eligibility: ["Artisans and craftspeople working with hands and tools in one of the 18 listed trades (for example carpenter, potter, tailor, blacksmith)", "Age 18 or above"],
    benefits: ["PM Vishwakarma certificate and ID card", "Skill training with a stipend", "Toolkit incentive", "Collateral-free loans at concessional interest, in two tranches"],
    howToApply: "Register at a Common Service Centre or on pmvishwakarma.gov.in; verification is done by the gram panchayat or urban local body.",
    helpline: "", website: "pmvishwakarma.gov.in",
  },
];

/** The national scheme finder (all Central and State schemes, with an eligibility check). */
export const MYSCHEME_URL = "https://www.myscheme.gov.in/search";
