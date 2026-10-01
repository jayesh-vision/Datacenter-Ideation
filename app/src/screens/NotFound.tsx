import { Link } from 'react-router-dom';
import { SearchX } from 'lucide-react';
import { usePage } from '../shell/page';
import { Empty } from '../ui/kit';

export function NotFound({ what = 'Page' }: { what?: string }) {
  usePage([{ label: 'Not found' }]);
  return <div className="page"><div className="card"><Empty icon={SearchX} title={`${what} not found`} action={<Link to="/" className="nst-btn nst-btn--sm">Back to command center</Link>}>The link may be stale, or the record was removed from the mock estate.</Empty></div></div>;
}
