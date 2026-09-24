import { splitFullName, splitSalary, type StaffEmployee } from "@/lib/staff";

const venueNames = {
  BB: "The Maine Land Brasserie",
  JBR: "The Maine Oyster Bar & Grill",
  SC: "The Maine Street Eatery",
  VM: "The Maine Beach House",
} as const;

// Names and default salaries match the Culinary position lookups.
// Leading rank numbers from the source sheet are dropped before matching.
const positionLookups: Record<string, { name: string; salary: number | null }> = {
  "head chef": { name: "Head Chef", salary: 20000 },
  "sous chef": { name: "Sous Chef", salary: 15000 },
  "jnr sous chef": { name: "JNR Sous Chef", salary: 12000 },
  cdp: { name: "Chef de Partie", salary: 6500 },
  "demi chef": { name: "Demi Chef", salary: 5000 },
  "commis 1": { name: "Commis 1", salary: 4100 },
  "commis 2": { name: "Commis 2", salary: 3800 },
  "commis 3": { name: "Commis 3", salary: 3500 },
  steward: { name: "Steward", salary: 2500 },
  "pastry chef": { name: "Pastry Chef", salary: null },
  "sushi chef": { name: "Sushi Chef", salary: null },
  "goods-in": { name: "Goods-In", salary: null },
  "head steward": { name: "Head Steward", salary: null },
};

const roster: ReadonlyArray<readonly [keyof typeof venueNames, string, string]> = [
  ["BB", "Deep Rai", "05. Jnr Sous Chef"],
  ["BB", "Eranga Prasad Ruparathna Katumetiyawe Patabedi Gedara", "07. Cdp"],
  ["BB", "Ragesh Velayudhan", "09. Demi Chef"],
  ["BB", "Sreejath Sivakumar", "09. Demi Chef"],
  ["BB", "Vilas Abbathini", "09. Demi Chef"],
  ["BB", "Ahmed Daker", "09. Demi Chef"],
  ["BB", "Andreas Gaitan", "09. Demi Chef"],
  ["BB", "Prashan Dewage", "10. Commis 1"],
  ["BB", "Bhupal Gharti Chhetri", "10. Commis 1"],
  ["BB", "Enisha", "11. Commis 2"],
  ["BB", "Arslan Ali", "12. Commis 3"],
  ["BB", "Arth Joseph Urmido Pastrana", "12. Commis 3"],
  ["BB", "Banuka Welage", "12. Commis 3"],
  ["BB", "Imran", "13. Steward"],
  ["JBR", "Kundan Singh", "04. Sous Chef"],
  ["JBR", "Kuldip Ale", "07. Cdp"],
  ["JBR", "Kattya Sedano", "07. Cdp"],
  ["JBR", "Aymen Cheikh", "09. Demi Chef"],
  ["JBR", "Rohan Bagla", "09. Demi Chef"],
  ["JBR", "Maharani Permatasari", "09. Demi Chef"],
  ["JBR", "Ayesh Da Silva", "10. Commis 1"],
  ["JBR", "Erika Hernández", "10. Commis 1"],
  ["JBR", "Vinay Kumar Sripadham Yadagiri Sripadham", "11. Commis 2"],
  ["JBR", "Desmond Newman", "11. Commis 2"],
  ["JBR", "Deepak Oli", "11. Commis 2"],
  ["JBR", "Rashmi Paboda", "12. Commis 3"],
  ["JBR", "Bikky Dc", "13. Steward"],
  ["JBR", "Naresh", "13. Steward"],
  ["JBR", "Bishnu Bahadur Thapa", "13. Steward"],
  ["SC", "Veeram Srinath Reddy", "02. Head Chef"],
  ["SC", "Manisha Harpreet", "09. Demi Chef"],
  ["SC", "Deb Bahadur Gurung", "10. Commis 1"],
  ["SC", "Guaravansh Singh", "11. Commis 2"],
  ["SC", "Nitin", "12. Commis 3"],
  ["SC", "Anton Vince", "12. Commis 3"],
  ["SC", "Dulshan Patabendige", "12. Commis 3"],
  ["SC", "Dinesh Nidamanuri", "12. Commis 3"],
  ["SC", "Mubashir Ali", "13. Steward"],
  ["VM", "Mahendra Negi Singh", "02. Head Chef"],
  ["VM", "Sudan", "04. Sous Chef"],
  ["VM", "Bryan Aldrich Clemente Basa", "05. Jnr Sous Chef"],
  ["VM", "Ishara Madushan Doraka Gamage", "Pastry Chef"],
  ["VM", "Jhon Carlo", "Sushi Chef"],
  ["VM", "Mark Costa", "Sushi Chef"],
  ["VM", "Mahendra Ram", "07. Cdp"],
  ["VM", "Rovin", "07. Cdp"],
  ["VM", "Srikanth", "07. Cdp"],
  ["VM", "Suresh Lo Tamang", "07. Cdp"],
  ["VM", "Yusarah", "07. Cdp"],
  ["VM", "Bikram", "07. Cdp"],
  ["VM", "Nima", "09. Demi Chef"],
  ["VM", "Rachana Rai", "09. Demi Chef"],
  ["VM", "Sachin Singh Bisht", "09. Demi Chef"],
  ["VM", "Sunil", "09. Demi Chef"],
  ["VM", "Khagen", "Goods-In"],
  ["VM", "Akash", "10. Commis 1"],
  ["VM", "Ankush", "10. Commis 1"],
  ["VM", "Deb Bahadur Paudel", "11. Commis 2"],
  ["VM", "Shashinika", "11. Commis 2"],
  ["VM", "Anil Dahal", "Head Steward"],
  ["VM", "Bimal", "12. Commis 3"],
  ["VM", "Harish", "12. Commis 3"],
  ["VM", "Hiran Kokitha", "12. Commis 3"],
  ["VM", "Sonam", "12. Commis 3"],
  ["VM", "Suraj Singh", "12. Commis 3"],
  ["VM", "Lal Bahadur", "12. Commis 3"],
  ["VM", "Francis", "13. Steward"],
  ["VM", "Md Rois", "13. Steward"],
  ["VM", "Prakash", "13. Steward"],
];

export const staffRoster: StaffEmployee[] = roster.map(([venue, name, position], index) => {
  const fullName = name.trim().replace(/\s+/g, " ");
  const parts = splitFullName(fullName);
  const key = position.replace(/^\d+\.\s*/, "").trim().toLowerCase();
  const lookup = positionLookups[key];
  if (!lookup) {
    throw new Error(`No position lookup for ${position}`);
  }

  const pay =
    lookup.salary == null
      ? { basicSalary: null, allowances: null, salary: null }
      : splitSalary(lookup.salary);

  return {
    id: `roster-${index + 1}`,
    fullName,
    firstName: parts.firstName,
    lastName: parts.lastName,
    photo: null,
    nationality: "",
    dateOfBirth: "",
    joiningDate: "",
    position: lookup.name,
    venue: venueNames[venue],
    ...pay,
  };
});
