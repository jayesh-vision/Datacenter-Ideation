/* Customization (13-Oct-2026, P2B merge phase 7): custom fields and tags on any record. Fields record what an operator adds to the
   model (how many records have a value is derived: the owner team from the device role, the cost centre from the site, …); tags are
   rules over the estate, so their counts always match the screens (critical path = devices in a single point of failure, …). Fields and
   tags added on the screen live in an overlay cleared when the estate is regenerated. */
import type { CustomField, TagDef } from '../api/types';
import type { Db } from './generate';
import { dcimModel } from './dcim';
import { sitePhys } from './physical';
import { modelDates } from './lifecycle';

const extraFields: CustomField[] = [], extraTags: TagDef[] = [];
export const resetCustomization = () => { extraFields.length = 0; extraTags.length = 0; };
export function customization(db: Db) {
  const dm = dcimModel(db);
  const nDev = dm.devices.length, nRack = dm.racks.length, nHall = dm.halls.length;
  const fields: CustomField[] = [
    { key: 'owner_team', label: 'Owner team', type: 'Select', appliesTo: ['Devices'], required: true, choices: ['Network', 'Compute', 'Storage', 'Facilities', 'Tenant'], filled: nDev, total: nDev, description: 'Team accountable for the device; filled from the device role.' },
    { key: 'cost_centre', label: 'Cost centre', type: 'Text', appliesTo: ['Racks', 'Devices'], required: false, filled: nRack + nDev - dm.devices.filter(d => d.status === 'Tenant-owned').length, total: nRack + nDev, description: 'Finance cost centre (site code); tenant equipment is billed to the tenant.' },
    { key: 'tenant_contract', label: 'Tenant contract', type: 'Text', appliesTo: ['Racks'], required: false, filled: dm.racks.filter(r => r.tenantId).length, total: nRack, description: 'Colocation contract reference of a leased cabinet.' },
    { key: 'warranty_end', label: 'Warranty end', type: 'Date', appliesTo: ['Devices'], required: false, filled: dm.devices.filter(d => d.status !== 'Tenant-owned').length, total: nDev, description: 'End of the OEM warranty (see the device lifecycle).' },
    { key: 'fire_zone', label: 'Fire zone', type: 'Text', appliesTo: ['Halls'], required: true, filled: nHall, total: nHall, description: 'Suppression zone covering the hall.' },
    { key: 'liquid_ready', label: 'Liquid ready', type: 'Boolean', appliesTo: ['Racks'], required: false, filled: nRack, total: nRack, description: 'The cabinet has manifold and CDU connections.' },
    ...extraFields
  ];
  const spof = new Set<string>(), eos = new Set<string>();
  for (const d of db.datacenters) for (const s of sitePhys(db, d.id)?.spofs ?? []) s.neIds.forEach(n => spof.add(n));
  for (const d of dm.devices) if (modelDates(d.model, db.now).endOfSupport < db.now + 365 * 864e5) eos.add(d.id);
  const tags: TagDef[] = [
    { slug: 'critical-path', name: 'Critical path', color: 'red', description: 'Devices inside a single point of failure.', rule: 'device ∈ any SPOF of its site', count: spof.size, appliesTo: 'Devices' },
    { slug: 'end-of-support-12m', name: 'End of support < 12 months', color: 'amber', description: 'Models leaving (or past) vendor support within a year.', rule: 'vendor end of support < today + 12 months', count: eos.size, appliesTo: 'Devices' },
    { slug: 'liquid-cooled', name: 'Liquid cooled', color: 'cyan', description: 'Racks on a liquid loop.', rule: 'rack.liquid', count: dm.racks.filter(r => r.liquid).length, appliesTo: 'Racks' },
    { slug: 'ai-density', name: 'AI density', color: 'purple', description: 'High-density AI racks.', rule: 'rack.density = AI', count: dm.racks.filter(r => r.density === 'AI').length, appliesTo: 'Racks' },
    { slug: 'tenant-cabinet', name: 'Tenant cabinet', color: 'slate', description: 'Cabinets leased to a colocation tenant.', rule: 'rack.owner = tenant', count: dm.racks.filter(r => r.owner === 'tenant').length, appliesTo: 'Racks' },
    { slug: 'planned', name: 'Planned', color: 'blue', description: 'Devices planned in DCIM, holding rack units.', rule: 'device.status = Planned', count: dm.devices.filter(d => d.status === 'Planned').length, appliesTo: 'Devices' },
    { slug: 'over-80pct', name: 'Over 80% power', color: 'amber', description: 'Racks drawing above 80% of their budget.', rule: 'rack.draw > 0.8 × budget', count: dm.racks.filter(r => r.powerPct > 80).length, appliesTo: 'Racks' },
    ...extraTags
  ];
  return { fields, tags };
}
export function addField(f: Omit<CustomField, 'filled' | 'total' | 'custom'>) {
  if (!f.label.trim()) throw new Error('Give the field a label');
  if (extraFields.some(x => x.key === f.key)) throw new Error('A field with this key exists');
  extraFields.push({ ...f, filled: 0, total: 0, custom: true });
}
export function addTag(t: Omit<TagDef, 'count' | 'custom'>) {
  if (!t.name.trim()) throw new Error('Give the tag a name');
  if (extraTags.some(x => x.slug === t.slug)) throw new Error('A tag with this name exists');
  extraTags.push({ ...t, count: 0, custom: true });
}
