// Predefined option lists for editable registration/student/guardian fields,
// mirroring the public registration form (apps/static) + worker districts list.
// Free-text fields (name, school, address, phone, email) are NOT enums.

export const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

export const MEDIUM_OPTIONS = [
  { value: 'national', label: 'National (Bangla or English version)' },
  { value: 'international', label: 'International (English Medium)' },
];

// Broad class range (the public form narrows per program; admin can set any).
export const CLASS_OPTIONS = [
  'Pre-primary', 'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5',
  'Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10',
].map((c) => ({ value: c, label: c }));

export const RELATIONSHIP_OPTIONS = [
  { value: 'Mother', label: 'Mother' },
  { value: 'Father', label: 'Father' },
  { value: 'Guardian', label: 'Guardian' },
];

export const SUBJECT_OPTIONS = [
  { value: 'math', label: 'Mathematics' },
  { value: 'science', label: 'Science' },
  { value: 'both', label: 'Both' },
];

export const VENUE_OPTIONS = [
  { value: 'dhaka', label: 'Dhaka' },
  { value: 'chittagong', label: 'Chittagong' },
  { value: 'rangpur', label: 'Rangpur' },
  { value: 'sylhet', label: 'Sylhet' },
];

export const DISTRICT_OPTIONS = [
  'Bagerhat', 'Bandarban', 'Barguna', 'Barisal', 'Bhola', 'Bogra',
  'Brahmanbaria', 'Chandpur', 'Chapainawabganj', 'Chittagong', 'Chuadanga',
  'Comilla', "Cox's Bazar", 'Dhaka', 'Dinajpur', 'Faridpur', 'Feni',
  'Gaibandha', 'Gazipur', 'Gopalganj', 'Habiganj', 'Jamalpur', 'Jessore',
  'Jhalokati', 'Jhenaidah', 'Joypurhat', 'Khagrachari', 'Khulna',
  'Kishoreganj', 'Kurigram', 'Kushtia', 'Lakshmipur', 'Lalmonirhat',
  'Madaripur', 'Magura', 'Manikganj', 'Meherpur', 'Moulvibazar',
  'Munshiganj', 'Mymensingh', 'Naogaon', 'Narail', 'Narayanganj',
  'Narsingdi', 'Natore', 'Netrokona', 'Nilphamari', 'Noakhali', 'Pabna',
  'Panchagarh', 'Patuakhali', 'Pirojpur', 'Rajbari', 'Rajshahi',
  'Rangamati', 'Rangpur', 'Satkhira', 'Shariatpur', 'Sherpur',
  'Sirajganj', 'Sunamganj', 'Sylhet', 'Tangail', 'Thakurgaon',
].map((d) => ({ value: d, label: d }));
