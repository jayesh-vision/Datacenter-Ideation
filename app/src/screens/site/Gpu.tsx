import { getGpu, useQuery } from '../../api';
import { GpuBody } from '../Gpu';

/* AI & GPU tab of a datacenter: the same view as the AI & GPU page, scoped to this site */
export function SiteGpu({ dcId }: { dcId: string }) {
  const { data } = useQuery(() => getGpu({ dcId }), [dcId]);
  if (!data) return null;
  return <GpuBody v={data} embedded />;
}
