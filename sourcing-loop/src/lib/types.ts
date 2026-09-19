/**
 * The shape of the supplied talent map (data/profiles.json).
 * This is the *only* source of truth about a candidate — every explanation the
 * product shows must be traceable back to one of these fields.
 */

export const COMPANY_TYPES = [
  "startup",
  "scaleup",
  "enterprise",
  "agency",
] as const;

export type CompanyType = (typeof COMPANY_TYPES)[number];

export type PastCompany = {
  company: string;
  company_type: CompanyType;
  title: string;
  years: number;
};

export type Profile = {
  id: string;
  name: string;
  current_title: string;
  years_experience: number;
  location: string;
  current_company: string;
  current_company_type: CompanyType;
  skills: string[];
  past_companies: PastCompany[];
  education: string;
  summary: string;
};

/** Field paths an explanation is allowed to cite. Keeps citations checkable. */
export const CITABLE_FIELDS = [
  "current_title",
  "years_experience",
  "location",
  "current_company",
  "current_company_type",
  "skills",
  "past_companies",
  "education",
  "summary",
] as const;

export type CitableField = (typeof CITABLE_FIELDS)[number];
