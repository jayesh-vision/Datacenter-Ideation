import { usePersona } from '../api';
import { usePage } from '../shell/page';

/* Data model explorer (user, 12-Oct-2026): the ontology page (public/data-model.html, source docs/dco-data-model.html)
   shown inside the shell so it sits in the menu like any other screen. The page keeps its own view state in the hash. */
export function DataModel() {
  usePage([{ label: 'Data model' }]);
  /* counts follow the persona chosen in the top bar */
  const { persona } = usePersona();
  return (
    <div className="dm-frame">
      <iframe key={persona} src={`/data-model.html?embed=1#persona=${persona}`} title="Data model: entities and how they connect" />
    </div>
  );
}
