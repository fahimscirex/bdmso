// All 64 districts of Bangladesh, alphabetised.
// Used by the registration form's datalist + client validation, and
// imported by the worker (worker/lib/districts.js mirrors this list)
// so server-side validation rejects anything not on the list.
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

// Case-insensitive lookup helper: returns the canonical-cased district
// name if value matches one in the list, or null otherwise. Useful for
// normalising user input on submit (so "dhaka" -> "Dhaka").
export function canonicalDistrict(value) {
  if (!value) return null;
  const v = String(value).trim().toLowerCase();
  return BD_DISTRICTS.find((d) => d.toLowerCase() === v) || null;
}
