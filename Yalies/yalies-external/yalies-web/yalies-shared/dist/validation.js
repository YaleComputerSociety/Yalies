// Institutional constants
export const YALE_COLLEGE = "Yale College";
export const YALE_COLLEGE_CODE = "YC";
// Yale residential colleges
export const VALID_COLLEGES = [
    "Benjamin Franklin College", "Berkeley College", "Branford College",
    "Davenport College", "Ezra Stiles College", "Grace Hopper College",
    "Jonathan Edwards College", "Morse College", "Pauli Murray College",
    "Pierson College", "Saybrook College", "Silliman College",
    "Timothy Dwight College", "Trumbull College",
];
// Update each academic year
export const EXPECTED_YEARS = [2026, 2027, 2028, 2029];
// Regex patterns
export const NETID_REGEX = /^[a-z]{2,4}\d{1,4}$/;
export const YALE_EMAIL_REGEX = /^[^@]+@(.*\.)?yale\.edu$/;
// Pipeline validation thresholds
export const VALIDATION_THRESHOLDS = {
    MIN_TOTAL_STUDENTS: 6000,
    MAX_TOTAL_STUDENTS: 8000,
    MIN_ENRICHMENT_RATE: 0.90,
    MIN_COLLEGES: 14,
    MIN_STUDENTS_PER_YEAR: 500,
    MIN_STUDENTS_PER_COLLEGE: 200,
};
// Filter fields exposed to the public (unauthenticated) filters endpoint
export const DEFAULT_FILTER_FIELDS = [
    "school", "year", "college", "major", "address_country",
];
// All fields that authenticated users can filter by
export const PERSON_ALLOWED_FILTER_FIELDS = [
    "netid", "upi", "email", "mailbox", "phone",
    "title", "first_name", "preferred_name", "middle_name", "last_name",
    "suffix", "pronouns",
    "school_code", "school", "year", "curriculum",
    "college", "college_code",
    "leave", "birth_day", "birth_month", "major", "access_code",
    "organization_code", "organization",
    "unit_class", "unit_code", "unit",
    "office_building", "office_room",
    "address_state", "address_country",
];
//# sourceMappingURL=validation.js.map