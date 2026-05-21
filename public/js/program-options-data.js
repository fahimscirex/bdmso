// GENERATED from public/data/programs-detail.json by scripts/build.mjs.
// Do not edit by hand - change each program's "options" in the JSON.
export const PROGRAM_OPTIONS = {
  "bdmso-preparatory": {
    "kind": "radio",
    "label": "Subjects",
    "help": "Choose your subjects. Each option includes 2 free Mock Test sessions.",
    "items": [
      {
        "id": "math",
        "label": "Math only",
        "sub": "12 classes - 2 free Math Mock Tests included",
        "price": 3500,
        "freeMock": [
          "mt1-math",
          "mt2-math"
        ]
      },
      {
        "id": "science",
        "label": "Science only",
        "sub": "12 classes - 2 free Science Mock Tests included",
        "price": 3500,
        "freeMock": [
          "mt1-sci",
          "mt2-sci"
        ]
      },
      {
        "id": "both-mock1",
        "label": "Math + Science Bundle (free Mock Test 1)",
        "sub": "12 classes each - Mock Test 1 (Math + Science) free",
        "price": 6000,
        "freeMock": [
          "mt1-math",
          "mt1-sci"
        ]
      },
      {
        "id": "both-mock2",
        "label": "Math + Science Bundle (free Mock Test 2)",
        "sub": "12 classes each - Mock Test 2 (Math + Science) free",
        "price": 6000,
        "freeMock": [
          "mt2-math",
          "mt2-sci"
        ]
      }
    ]
  },
  "mock-test": {
    "kind": "checkbox",
    "label": "BdMSO Mock Test sessions",
    "help": "Pick one or more sessions. Each subject is BDT 500.",
    "items": [
      {
        "id": "mt1-math",
        "label": "Mock Test 1 - Math",
        "sub": "Sat 6 Jun 2026 - 3-4 PM - MASLab, Dhaka",
        "price": 500
      },
      {
        "id": "mt1-sci",
        "label": "Mock Test 1 - Science",
        "sub": "Sat 6 Jun 2026 - 5-6 PM - MASLab, Dhaka",
        "price": 500
      },
      {
        "id": "mt2-math",
        "label": "Mock Test 2 - Math",
        "sub": "Sat 20 Jun 2026 - 3-4 PM - MASLab, Dhaka",
        "price": 500
      },
      {
        "id": "mt2-sci",
        "label": "Mock Test 2 - Science",
        "sub": "Sat 20 Jun 2026 - 5-6 PM - MASLab, Dhaka",
        "price": 500
      }
    ]
  }
};
