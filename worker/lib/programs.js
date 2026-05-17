// Program catalog — display names and BDT pricing keyed by registration_type slug.
//
// NOTE: this is hard-coded today. Once the dashboard programs CRUD lands and
// the `programs` table becomes the source of truth, these maps move into a
// D1 query (or get hydrated from there at request time).

export const PROGRAM_NAMES = {
  "national-qualifying-round":      "BdMSO National Round",
  "national-qualifying-round-both": "BdMSO National Round (Math + Science)",
  "national-quiz-competition":      "BdMSO Quiz Competition",
  "stem-foundation":           "STEM Foundation Program",
  "bdmso-preparatory":         "BdMSO Preparatory Course",
  "stem-masterclass":          "STEM Masterclass Series",
  "mock-test":                 "Mock Test Program",
  "lab-day":                   "Lab Day Workshop",
  "robotics-foundation":       "Robotics Foundation Course",
  "summer-camp":               "SPSB Nature Camp",
  "winter-camp":               "International Summer/Winter Camp",
  "exchange-program":          "BdMSO Exchange Program",
};

// Pricing map: registration_type slug → BDT amount
export const PROGRAM_PRICES = {
  "national-qualifying-round":      1000,
  "national-qualifying-round-both": 1500,
  "national-quiz-competition":      1000,
  "stem-foundation":                8000,
  "bdmso-preparatory":              12000,
  "stem-masterclass":               6000,
  "mock-test":                      3000,
  "lab-day":                        2000,
  "robotics-foundation":            7000,
  "summer-camp":                    15000,
  "winter-camp":                    25000,
  "exchange-program":               50000,
};
