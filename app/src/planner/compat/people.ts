/* The planner's cast: P2B's roles (who designs, who approves at which amount) filled with this geography's people.
   Refilled in place when the geography changes, so modules that imported PEOPLE see the new names. */

export interface Person { id: string; name: string; role: string; team: string; site?: string }
const ROLES: [string, string][] = [
  ['Administrator', 'Platform'], ['Program Manager', 'Delivery'], ['Project Manager', 'Delivery'], ['Facilities Director', 'Facilities'], ['Network Engineer', 'NetEng'],
  ['Capacity Planner', 'Platform'], ['Field Technician', 'Facilities'], ['Commissioning Engineer', 'Delivery'], ['Finance Manager', 'Finance'], ['Executive', 'Leadership'],
  ['Vendor Project Manager', 'Build partner'], ['NOC Lead', 'Operations'], ['Compliance Manager', 'GRC'], ['Security Manager', 'Security'], ['Platform Owner', 'Platform'],
  ['Facilities Engineer', 'Facilities'], ['Facilities Engineer', 'Facilities'], ['Network Engineer', 'NetEng'], ['Site Technician', 'Facilities'], ['Facilities Engineer', 'Facilities'],
  /* a second holder of every approving role, so a plan's own requester never has to approve it */
  ['Capacity Planner', 'Platform'], ['Facilities Director', 'Facilities'], ['Finance Manager', 'Finance'], ['Executive', 'Leadership'], ['Network Engineer', 'NetEng'], ['NOC Lead', 'Operations'],
];
/* the geography's operations people first, then planners and approvers so every role has its own person */
const EXTRA: Record<string, string[]> = {
  in: ['Ananya Bose', 'Rohit Malhotra', 'Farah Qureshi', 'Siddharth Menon', 'Lakshmi Pillai', 'Nikhil Joshi', 'Pooja Reddy', 'Harish Gupta', 'Divya Narayan', 'Imran Shaikh', 'Tanvi Desai', 'Karthik Raman', 'Neha Kapoor', 'Aditya Rao', 'Shreya Bhatt', 'Manish Tiwari'],
  us: ['Rachel Adams', 'Brian Foster', 'Monica Reyes', 'Kevin Walsh', 'Laura Bennett', 'Chris Morgan', 'Nadia Hassan', 'Peter Novak', 'Hannah Scott', 'Ethan Park', 'Olivia Grant', 'Marcus Bell', 'Priya Shah', 'Daniel Cruz', 'Sophie Lane', 'Andre Thompson'],
};
export const PEOPLE: Person[] = [];
let builtFor = '';
/** Fill the cast for the current geography; `sites` = datacenter ids that get a local facilities / network engineer. */
export function castPeople(g: { id: string; people: string[] }, sites: string[] = []): Person[] {
  const key = `${g.id}|${sites.join(',')}`;
  if (key === builtFor && PEOPLE.length) return PEOPLE;
  builtFor = key;
  const names = [...g.people, ...(EXTRA[g.id] ?? EXTRA.in)].filter((n, i, a) => a.indexOf(n) === i);
  PEOPLE.length = 0;
  ROLES.forEach(([role, team], i) => PEOPLE.push({ id: `U${String(i + 1).padStart(2, '0')}`, name: names[i % names.length], role, team, site: i >= 15 ? sites[i - 15] : undefined }));
  return PEOPLE;
}
castPeople({ id: 'in', people: [] });
