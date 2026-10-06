import * as I from 'lucide-react';
import { geoNow } from '../api';

/* the currency icon of the active geography: ₹ in India, $ in the USA */
export function MoneyIcon({ size = 16 }: { size?: number }) {
  return geoNow().currency.code === 'USD' ? <I.DollarSign size={size} /> : <I.IndianRupee size={size} />;
}
/* the same as a Lucide icon component, for props typed `icon: LucideIcon` */
export const moneyIcon = (): I.LucideIcon => (geoNow().currency.code === 'USD' ? I.DollarSign : I.IndianRupee);
