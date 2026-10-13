/* The planner's "now" is the app's clock (the mock's fixed demo time), so plan dates, lead times and holds agree with every other
   screen. The mock server sets it (no import of the API here: the mock imports planner code, which would make a cycle). */
let get = () => Date.now();
export const setPlannerClock = (f: () => number) => { get = f; };
export const clockMs = (): number => get();
