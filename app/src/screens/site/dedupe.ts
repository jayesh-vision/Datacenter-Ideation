/* Duplicate-information cleanup on the datacenter page (16-Oct-2026, user: "hide the overlap / duplicate information, keep
   the code; if anything is missing we roll back, else delete later").
   Power, backup, cooling and environment live on the Facilities screen (power path, ride-through, heat balance, zones), so
   the datacenter tabs no longer repeat them:
     Metrics        — hides the load, cooling and battery vitals, the zone table and smoke / leak stat, the UPS table and the
                      battery / DG test stats (all on Facilities). Keeps what Facilities does not show: average zone
                      temperature and humidity with 24 h trends, diesel in litres (tank, burn, 30-day use), rack inlet
                      average and range, hottest device chassis, hottest racks, hardware fault indicators, device load.
     Space & ports  — (was "Power & space", moved to Infrastructure 16-Oct-2026) hides the "Power in use" card, the plant lines of the "Building" card, the "Power" feeds + 24 h load
                      panel, "Where the power goes" and the "Cooling" panel; keeps rack space, ports, floors / rooms / racks.
     Assets         — hides the floors / racks / rack-space / ports figures of the strip and the port classes of
                      "Ports & compute" (all on Space & ports); keeps space by room (devices per room are only here),
                      equipment by category, facility assets, compute and lifecycle (RMA, spares, warranty).
   Roll back: set SHOW_DUPLICATES = true. */
export const SHOW_DUPLICATES = false;
