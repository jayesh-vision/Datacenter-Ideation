// ui_kits/admin-console/app.jsx
// Interactive admin-console prototype. Requires components.jsx loaded first.

const { useState } = React;

const SEED_DEALS = [
  { id: 'D-1042', name: 'Acme Corp',   owner: 'J. Park',    stage: 'Qualified',       amount: 24000, status: 'info',    updated: '2h ago' },
  { id: 'D-1041', name: 'Northwind',   owner: 'M. Alvarez', stage: 'Closed won',      amount: 18600, status: 'success', updated: '5h ago' },
  { id: 'D-1040', name: 'Globex',      owner: 'S. Ito',     stage: 'Pending approval',amount: 11500, status: 'caution', updated: '1d ago' },
  { id: 'D-1039', name: 'Initech',     owner: 'J. Park',    stage: 'Lead identified', stageTone: 'teal', amount: 8200,  status: 'teal',    updated: '1d ago' },
  { id: 'D-1038', name: 'Umbrella',    owner: 'R. Gupta',   stage: 'Closed lost',     amount: 4300,  status: 'danger',  updated: '2d ago' },
  { id: 'D-1037', name: 'Hooli',       owner: 'M. Alvarez', stage: 'On hold',         amount: 15400, status: 'warn',    updated: '3d ago' },
  { id: 'D-1036', name: 'Wayne Ent.',  owner: 'S. Ito',     stage: 'Draft',           amount: 0,     status: 'neutral', updated: '1w ago' },
];

const Sidebar = ({ active, onNav }) => {
  const items = [
    { key: 'dashboard', label: 'Dashboard', icon: 'squares-four' },
    { key: 'deals',     label: 'Deals',     icon: 'handshake' },
    { key: 'customers', label: 'Customers', icon: 'users' },
    { key: 'reports',   label: 'Reports',   icon: 'chart-bar' },
    { key: 'settings',  label: 'Settings',  icon: 'gear' },
  ];
  return (
    <nav style={{ width: 220, background: '#fff', borderRight: '1px solid #E9E9E9', padding: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px 16px' }}>
        <img src="../../assets/logo.svg" alt="Aurora" style={{ height: 24 }} />
      </div>
      {items.map(it => {
        const isActive = it.key === active;
        return (
          <button key={it.key} onClick={() => onNav(it.key)} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
            background: isActive ? '#F4F4F4' : 'transparent', color: '#252525',
            border: 'none', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
            font: `${isActive ? 500 : 400} 14px/20px Inter`,
          }}>
            <Icon name={it.icon} size={16} style={{ color: isActive ? '#1C81EF' : '#7C7C7C' }} />
            {it.label}
          </button>
        );
      })}
    </nav>
  );
};

const Topbar = ({ onNew }) => (
  <header style={{
    height: 56, background: '#fff', borderBottom: '1px solid #E9E9E9',
    padding: '0 24px', display: 'flex', alignItems: 'center', gap: 16,
  }}>
    <div style={{ flex: 1, maxWidth: 360 }}>
      <Field value="" onChange={() => {}} placeholder="Search deals, customers…" prefix={<Icon name="magnifying-glass" size={14} style={{ color: '#7C7C7C' }} />} />
    </div>
    <div style={{ flex: 1 }} />
    <Button size="sm" variant="borderless" leftIcon="question"> </Button>
    <Button size="sm" variant="borderless" leftIcon="bell"> </Button>
    <div style={{ width: 1, height: 24, background: '#E9E9E9' }} />
    <Button size="sm" variant="filled" leftIcon="plus" onClick={onNew}>New deal</Button>
    <div style={{ width: 28, height: 28, borderRadius: 999, background: '#1C81EF', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', font: '600 12px/18px Inter' }}>SA</div>
  </header>
);

const Metric = ({ label, value, delta, tone = 'success' }) => (
  <Card padding={16} style={{ flex: 1, minWidth: 0 }}>
    <div style={{ font: '500 12px/18px Inter', color: '#7C7C7C', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
    <div style={{ font: '600 24px/32px Inter', color: '#252525', marginTop: 6 }}>{value}</div>
    {delta && <div style={{ marginTop: 8 }}><Chip tone={tone}>{delta}</Chip></div>}
  </Card>
);

const DealsTable = ({ deals, selected, onSelect, onOpen, onSelectAll, allSelected }) => {
  const gridCols = '40px 110px minmax(140px, 1fr) 140px 180px 110px 90px';
  const cell = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 };
  return (
    <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E9E9E9', overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: gridCols, columnGap: 16, padding: '10px 16px', background: '#F4F4F4', font: '600 12px/18px Inter', color: '#515151', borderBottom: '1px solid #E9E9E9' }}>
        <Checkbox checked={allSelected} onChange={onSelectAll} />
        <div style={cell}>ID</div><div style={cell}>Customer</div><div style={cell}>Owner</div><div style={cell}>Stage</div><div style={{ ...cell, textAlign: 'right' }}>Amount</div><div style={{ ...cell, textAlign: 'right' }}>Updated</div>
      </div>
      {deals.map((d, i) => (
        <div key={d.id} style={{
          display: 'grid', gridTemplateColumns: gridCols, columnGap: 16,
          padding: '10px 16px', alignItems: 'center', borderBottom: i === deals.length - 1 ? 'none' : '1px solid #E9E9E9',
          font: '400 14px/20px Inter', cursor: 'pointer', background: '#fff',
        }}
        onClick={() => onOpen(d)}
        >
          <span onClick={e => e.stopPropagation()}>
            <Checkbox checked={selected.includes(d.id)} onChange={() => onSelect(d.id)} />
          </span>
          <span style={{ ...cell, color: '#7C7C7C', fontFamily: 'ui-monospace, SFMono-Regular, monospace', fontSize: 13 }}>{d.id}</span>
          <span style={{ ...cell, color: '#252525', fontWeight: 500 }}>{d.name}</span>
          <span style={{ ...cell, color: '#515151' }}>{d.owner}</span>
          <span style={cell}><Chip tone={d.status}>{d.stage}</Chip></span>
          <span style={{ ...cell, textAlign: 'right', fontWeight: 500 }}>{d.amount ? `$${d.amount.toLocaleString()}` : '—'}</span>
          <span style={{ ...cell, textAlign: 'right', color: '#7C7C7C' }}>{d.updated}</span>
        </div>
      ))}
    </div>
  );
};

const Dashboard = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
    <div>
      <div style={{ font: '600 24px/32px Inter', letterSpacing: '-.005em' }}>Dashboard</div>
      <div style={{ font: '400 14px/20px Inter', color: '#515151', marginTop: 2 }}>Pipeline snapshot, last 30 days.</div>
    </div>
    <div style={{ display: 'flex', gap: 16 }}>
      <Metric label="Pipeline value" value="$428,120" delta="+12.4%" tone="success" />
      <Metric label="Closed won" value="$94,600" delta="+3.1%" tone="success" />
      <Metric label="Win rate" value="34%" delta="−1.8%" tone="danger" />
      <Metric label="Open deals" value="48" delta="+6" tone="info" />
    </div>
    <Card>
      <div style={{ font: '500 14px/20px Inter', color: '#252525', marginBottom: 12 }}>Weekly pipeline</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 160, padding: '0 4px' }}>
        {[40, 65, 52, 78, 90, 70, 85, 95, 60, 72, 88, 100].map((h, i) => (
          <div key={i} style={{ flex: 1, height: `${h}%`, background: i === 11 ? '#1C81EF' : '#DBEAFE', borderRadius: 6, transition: 'background 150ms' }} />
        ))}
      </div>
    </Card>
  </div>
);

const DealsView = ({ deals, onOpen, onNew }) => {
  const [tab, setTab] = useState('all');
  const [selected, setSelected] = useState([]);
  const filtered = tab === 'all' ? deals : deals.filter(d => d.status === tab);
  const toggle = id => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const toggleAll = () => setSelected(selected.length === filtered.length ? [] : filtered.map(d => d.id));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <div style={{ font: '600 24px/32px Inter', letterSpacing: '-.005em' }}>Deals</div>
          <div style={{ font: '400 14px/20px Inter', color: '#515151', marginTop: 2 }}>{filtered.length} of {deals.length}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button size="sm" variant="outline" leftIcon="funnel">Filter</Button>
          <Button size="sm" variant="outline" leftIcon="export">Export</Button>
          <Button size="sm" variant="filled" leftIcon="plus" onClick={onNew}>New deal</Button>
        </div>
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'all', label: 'All' },
        { value: 'info', label: 'Qualified' },
        { value: 'caution', label: 'Pending' },
        { value: 'success', label: 'Closed won' },
        { value: 'danger', label: 'Closed lost' },
      ]} />
      {selected.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: '#F4F9FF', border: '1px solid #DBEAFE', borderRadius: 8 }}>
          <span style={{ font: '500 14px/20px Inter', color: '#1D4EB8' }}>{selected.length} selected</span>
          <div style={{ flex: 1 }} />
          <Button size="xs" variant="borderless">Assign</Button>
          <Button size="xs" variant="borderless">Archive</Button>
          <Button size="xs" variant="red">Delete</Button>
        </div>
      )}
      <DealsTable deals={filtered} selected={selected} allSelected={filtered.length > 0 && selected.length === filtered.length} onSelectAll={toggleAll} onSelect={toggle} onOpen={onOpen} />
    </div>
  );
};

const DealDetail = ({ deal, onBack, onEdit }) => {
  const [tab, setTab] = useState('overview');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, font: '400 13px/20px Inter', color: '#7C7C7C' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#1C81EF', cursor: 'pointer', padding: 0, font: '500 13px/20px Inter' }}>Deals</button>
        <Icon name="caret-right" size={12} />
        <span style={{ fontFamily: 'ui-monospace, monospace' }}>{deal.id}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ font: '600 24px/32px Inter' }}>{deal.name}</div>
            <Chip tone={deal.status}>{deal.stage}</Chip>
          </div>
          <div style={{ font: '400 14px/20px Inter', color: '#515151', marginTop: 4 }}>Owned by {deal.owner} · Updated {deal.updated}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Tooltip title="Keyboard shortcut" body="Press E anywhere to edit this deal.">
            <Button size="sm" variant="outline" leftIcon="pencil-simple" onClick={onEdit}>Edit</Button>
          </Tooltip>
          <Button size="sm" variant="outline" leftIcon="share">Share</Button>
          <Button size="sm" variant="filled">Advance stage</Button>
        </div>
      </div>
      <Stepper current={2} steps={['Lead', 'Qualified', 'Proposal', 'Negotiation', 'Closed']} />
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'overview', label: 'Overview' },
        { value: 'activity', label: 'Activity' },
        { value: 'files', label: 'Files' },
        { value: 'notes', label: 'Notes' },
      ]} />
      {tab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
          <Card>
            <div style={{ font: '500 14px/20px Inter', marginBottom: 12 }}>Details</div>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', rowGap: 10, font: '400 14px/20px Inter' }}>
              <span style={{ color: '#7C7C7C' }}>Amount</span><span style={{ fontWeight: 500 }}>${deal.amount.toLocaleString()}</span>
              <span style={{ color: '#7C7C7C' }}>Stage</span><span><Chip tone={deal.status}>{deal.stage}</Chip></span>
              <span style={{ color: '#7C7C7C' }}>Close date</span><span>Dec 12, 2025</span>
              <span style={{ color: '#7C7C7C' }}>Source</span><span>Inbound · website</span>
              <span style={{ color: '#7C7C7C' }}>Priority</span><span><Chip tone="warn">High</Chip></span>
            </div>
          </Card>
          <Card>
            <div style={{ font: '500 14px/20px Inter', marginBottom: 12 }}>Preferences</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Toggle on={true}  onChange={() => {}} label="Email updates" />
              <Toggle on={false} onChange={() => {}} label="SMS alerts" />
              <Toggle on={true}  onChange={() => {}} label="Weekly digest" />
            </div>
          </Card>
        </div>
      )}
      {tab === 'activity' && (
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              { who: 'J. Park',     what: 'Advanced stage to Qualified.', when: '2h ago' },
              { who: 'System',      what: 'Reminder sent to customer.',    when: '5h ago' },
              { who: 'M. Alvarez',  what: 'Added a note.',                 when: '1d ago' },
              { who: 'J. Park',     what: 'Created the deal.',             when: '3d ago' },
            ].map((e, i) => (
              <div key={i} style={{ display: 'flex', gap: 10 }}>
                <div style={{ width: 6, height: 6, borderRadius: 999, background: '#1C81EF', marginTop: 7 }} />
                <div>
                  <div style={{ font: '400 14px/20px Inter' }}><b style={{ fontWeight: 500 }}>{e.who}</b> {e.what}</div>
                  <div style={{ font: '400 12px/18px Inter', color: '#7C7C7C' }}>{e.when}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
      {tab === 'files' && (
        <Card><div style={{ color: '#7C7C7C', font: '400 14px/20px Inter' }}>No files attached.</div></Card>
      )}
      {tab === 'notes' && (
        <Card><div style={{ color: '#7C7C7C', font: '400 14px/20px Inter' }}>No notes yet.</div></Card>
      )}
    </div>
  );
};

const NewDealModal = ({ open, onClose, onCreate }) => {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ name: '', owner: '', amount: '', email: '', priority: 'medium', notify: true, agree: false });
  if (!open) return null;
  const next = () => step < 2 ? setStep(step + 1) : onCreate(form);
  const steps = ['Customer', 'Details', 'Review'];
  const canNext = (step === 0 && form.name && form.email) || step === 1 || (step === 2 && form.agree);
  const error = step === 0 && form.email && !form.email.includes('@') ? 'Enter a valid email.' : null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,13,18,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: 560, background: '#fff', borderRadius: 16, boxShadow: '0 12px 40px rgba(10,13,18,.18)', overflow: 'hidden' }}>
        <div style={{ padding: 20, borderBottom: '1px solid #E9E9E9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ font: '600 16px/24px Inter' }}>New deal</div>
          <Button size="xs" variant="borderless" onClick={onClose} leftIcon="x"> </Button>
        </div>
        <div style={{ padding: '16px 20px 8px' }}>
          <Stepper current={step} steps={steps} />
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {step === 0 && (<>
            <Field label="Customer name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Acme Corp" />
            <Field label="Primary contact email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="you@company.com" error={error} />
          </>)}
          {step === 1 && (<>
            <Field label="Deal amount" prefix="$" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="10,000" />
            <Field label="Owner" value={form.owner} onChange={e => setForm({ ...form, owner: e.target.value })} placeholder="J. Park" />
            <div>
              <div style={{ font: '500 14px/20px Inter', marginBottom: 6 }}>Priority</div>
              <div style={{ display: 'flex', gap: 16 }}>
                {['low', 'medium', 'high'].map(p => (
                  <label key={p} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <span style={{ width: 18, height: 18, borderRadius: 999, border: '1px solid #E3E3E3', background: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                      onClick={() => setForm({ ...form, priority: p })}>
                      {form.priority === p && <span style={{ width: 9, height: 9, borderRadius: 999, background: '#1C81EF' }} />}
                    </span>
                    <span style={{ font: '400 14px/20px Inter', textTransform: 'capitalize' }}>{p}</span>
                  </label>
                ))}
              </div>
            </div>
            <Toggle on={form.notify} onChange={v => setForm({ ...form, notify: v })} label="Notify owner on create" />
          </>)}
          {step === 2 && (<>
            <Card padding={16} style={{ background: '#F4F4F4', border: 'none' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', rowGap: 8, font: '400 14px/20px Inter' }}>
                <span style={{ color: '#7C7C7C' }}>Customer</span><span>{form.name || '—'}</span>
                <span style={{ color: '#7C7C7C' }}>Email</span><span>{form.email || '—'}</span>
                <span style={{ color: '#7C7C7C' }}>Amount</span><span>${form.amount || '—'}</span>
                <span style={{ color: '#7C7C7C' }}>Owner</span><span>{form.owner || '—'}</span>
                <span style={{ color: '#7C7C7C' }}>Priority</span><span style={{ textTransform: 'capitalize' }}>{form.priority}</span>
              </div>
            </Card>
            <Checkbox checked={form.agree} onChange={v => setForm({ ...form, agree: v })} label="I've double-checked these details." />
          </>)}
        </div>
        <div style={{ padding: 16, borderTop: '1px solid #E9E9E9', display: 'flex', justifyContent: 'space-between' }}>
          <Button size="sm" variant="borderless" onClick={() => step === 0 ? onClose() : setStep(step - 1)}>{step === 0 ? 'Cancel' : 'Back'}</Button>
          <Button size="sm" variant="filled" onClick={next} disabled={!canNext}>{step === 2 ? 'Create deal' : 'Continue'}</Button>
        </div>
      </div>
    </div>
  );
};

const App = () => {
  const [active, setActive] = useState('deals');
  const [deals, setDeals] = useState(SEED_DEALS);
  const [openDeal, setOpenDeal] = useState(null);
  const [modal, setModal] = useState(false);

  const view = openDeal ? 'detail' : active;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: '#F4F4F4' }}>
      <Sidebar active={active} onNav={k => { setOpenDeal(null); setActive(k); }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Topbar onNew={() => setModal(true)} />
        <main style={{ flex: 1, padding: 24, overflow: 'auto' }}>
          {view === 'dashboard' && <Dashboard />}
          {view === 'deals' && <DealsView deals={deals} onOpen={setOpenDeal} onNew={() => setModal(true)} />}
          {view === 'detail' && <DealDetail deal={openDeal} onBack={() => setOpenDeal(null)} onEdit={() => setModal(true)} />}
          {view === 'customers' && <EmptyView title="Customers" />}
          {view === 'reports'   && <EmptyView title="Reports" />}
          {view === 'settings'  && <EmptyView title="Settings" />}
        </main>
      </div>
      <NewDealModal open={modal} onClose={() => setModal(false)} onCreate={form => {
        const id = `D-${1043 + (deals.length - 7)}`;
        setDeals([{ id, name: form.name, owner: form.owner || 'Unassigned', stage: 'Qualified', amount: Number((form.amount || '0').replace(/,/g, '')) || 0, status: 'info', updated: 'just now' }, ...deals]);
        setModal(false);
      }} />
    </div>
  );
};

const EmptyView = ({ title }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    <div style={{ font: '600 24px/32px Inter' }}>{title}</div>
    <Card><div style={{ color: '#7C7C7C', font: '400 14px/20px Inter' }}>Nothing here yet.</div></Card>
  </div>
);

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
