// All 64 districts of Bangladesh, alphabetised.
// Mirror of public/js/bd-districts.js so the worker can validate
// submitted district values without trusting the client.
export const BD_DISTRICTS = [
  "Bagerhat", "Bandarban", "Barguna", "Barisal", "Bhola", "Bogra",
  "Brahmanbaria", "Chandpur", "Chapainawabganj", "Chittagong", "Chuadanga",
  "Comilla", "Cox's Bazar", "Dhaka", "Dinajpur", "Faridpur", "Feni",
  "Gaibandha", "Gazipur", "Gopalganj", "Habiganj", "Jamalpur", "Jessore",
  "Jhalokati", "Jhenaidah", "Joypurhat", "Khagrachari", "Khulna",
  "Kishoreganj", "Kurigram", "Kushtia", "Lakshmipur", "Lalmonirhat",
  "Madaripur", "Magura", "Manikganj", "Meherpur", "Moulvibazar",
  "Munshiganj", "Mymensingh", "Naogaon", "Narail", "Narayanganj",
  "Narsingdi", "Natore", "Netrokona", "Nilphamari", "Noakhali", "Pabna",
  "Panchagarh", "Patuakhali", "Pirojpur", "Rajbari", "Rajshahi",
  "Rangamati", "Rangpur", "Satkhira", "Shariatpur", "Sherpur",
  "Sirajganj", "Sunamganj", "Sylhet", "Tangail", "Thakurgaon"
];

const BY_LOWER = new Map(BD_DISTRICTS.map((d) => [d.toLowerCase(), d]));

// Returns the canonical-cased district if `value` matches one in the
// list (case-insensitive), or null if it doesn't. The worker uses this
// to both validate AND normalise the stored value.
export function canonicalDistrict(value) {
  if (!value) return null;
  return BY_LOWER.get(String(value).trim().toLowerCase()) || null;
}
