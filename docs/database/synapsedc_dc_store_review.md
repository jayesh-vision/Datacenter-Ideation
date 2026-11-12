# DC-STORE schema review — 06-Nov-2026, re-reviewed 12-Nov-2026

## Re-review 12-Nov-2026: PASS, 9.71 / 10

**What changed:** all 11 findings are fixed in `scripts/db/build_schema.py` and the schema was regenerated (BRD 1.0-rc5).

**How it was checked:**
- The new `synapsedc_dc_store.sql` was loaded into MySQL 9.6.
- The same `information_schema` checks as the first review were re-run.
- 28 insert tests were run. Each one checks that a bad row is rejected for the expected reason (foreign key 1452, check 3819 or duplicate 1062), or that a good row is accepted.

**Result:** 0 Critical, 0 Major and 0 Minor findings remain, so the gate passes.

**What the new schema contains:**
- 109 tables and 1,706 columns.
- 125 foreign keys, all tenant-aware.
- 187 checks.
- 249 secondary indexes, up from 199. Of these, 68 are the new parent `UNIQUE (TENANT_ID, <TABLE>_ID)` keys that tenant-aware foreign keys require.

**What the first review's fixes file became:** `synapsedc_dc_store_review_fixes.sql` was removed. The generator now holds every fix. That file would also have left the self-references unenforced (see the MySQL note under C1).

**Your local copy:** it still has the rc4 schema. Drop it and reinstall from the new `.sql`.

| Id | Finding | Status | How it was fixed and tested |
|---|---|---|---|
| C1 | No FK checks the tenant | **Fixed** | Every FK is `(TENANT_ID, col)` → the parent's `(TENANT_ID, <PARENT>_ID)`. Keys that started with an FK column now start with `TENANT_ID`. The six `SET NULL` keys are now `RESTRICT`. Tested: a phase, a template version, a child plan and a sub-region under another tenant's parent are each rejected (1452). |
| M1 | Candidate site by code | **Fixed** | `PLAN_SITE.PLAN_CANDIDATE_SITE_ID` is an FK `(TENANT_ID, PLAN_ID, id)`, so the candidate must belong to the same plan. A check requires it exactly when `REF_KIND = 'candidate'`, and `REF_ID` is required otherwise. Tested: another plan's candidate is rejected, a candidate row without the id is rejected, and a candidate of the same plan is accepted. |
| M2 | 41 unchecked numbers | **Fixed** | The generator adds a range check to every signed number that no check mentions: `>= 0`, `BETWEEN 0 AND 100` for `*_PCT`, and `> 0` for the two multipliers. The deltas and `THRESHOLD` stay signed on purpose. The audit finds 0 unchecked columns. Tested: negative CapEx and a 140% share are rejected (3819). |
| M3 | Nullable column in a unique key | **Fixed** | `ROLE` and `INTERFACE_NAME` are `NOT NULL DEFAULT ''`. Tested: a duplicate equipment line with no role is rejected (1062). |
| m1 | Comment can cross plans | **Fixed** | The review and parent-comment FKs include `PLAN_ID`. Tested: a comment citing another plan's review is rejected, and a reply to another plan's comment is rejected. |
| m2 | No estate-wide queue index | **Fixed** | `(TENANT_ID, STAGE)` on `MACD_REQUEST`; `(TENANT_ID, STATUS)` on `DCIM_WORK_ITEM` and `POWER_FINDING`. |
| m3 | `REGO_SOURCE` MEDIUMTEXT | **Fixed** | Now `TEXT`. |
| m4 | 24 hash-suffixed names | **Fixed** | No hash names remain. A name over 64 characters swaps table names for short aliases, e.g. `UK_PTI_TENANT_ID_PTV_ID_INPUT_KEY` (29 names). The data dictionary now opens with the alias table. |
| m5 | Cached names, no refresh rule | **Fixed** | `PLAN.OWNER_NAME` was dropped; the name is read from Platform Engineering. The other 12 say "(snapshot, never refreshed)" and when the snapshot was taken. |
| m6 | Three "open item" vocabularies | **Fixed** | One shared `ITEM_STATUS` (`Open`, `Resolved`, `Dismissed`) on `PLAN_REVIEW_COMMENT`, `PLAN_CONDITION` and `POWER_FINDING`. Checks now read `(STATUS = 'Open') = (… IS NULL)`. |
| m7 | Reviewer e-mail in plain text | **Fixed** | `PLAN_REVIEW_REVIEWER.EMAIL` was dropped. The address is resolved from `REVIEWER_USER_ID` when the pack is sent. |

**MySQL note found while testing C1:** MySQL 9.6 accepts a self-referencing composite foreign key whose columns start with the shared columns, `(TENANT_ID, PLAN_ID, PARENT_COMMENT_ID)` → `(TENANT_ID, PLAN_ID, PLAN_REVIEW_COMMENT_ID)`, and then never enforces it. A reply pointing at a missing comment was stored with no error. With the referencing column first, `(PARENT_COMMENT_ID, TENANT_ID, PLAN_ID)`, the key is enforced. The generator therefore puts the referencing column first in all four self-references:
- `PLAN.PARENT_PLAN_ID`
- `PLAN.REVISION_OF_PLAN_ID`
- `GEOGRAPHY_REGION.PARENT_REGION_ID`
- `PLAN_REVIEW_COMMENT.PARENT_COMMENT_ID`

Tested: a missing parent plan and a missing parent region are both rejected by their own key.

| Dimension | Weight | Was | Now | Weighted |
|---|---|---|---|---|
| Referential integrity | 20% | 5.0 | 9.5 | 1.900 |
| Indexing and performance | 18% | 9.0 | 9.5 | 1.710 |
| Data types | 12% | 9.0 | 10.0 | 1.200 |
| Naming | 8% | 9.0 | 9.5 | 0.760 |
| Constraints | 15% | 6.5 | 10.0 | 1.500 |
| Normalization | 12% | 8.5 | 9.5 | 1.140 |
| Security | 5% | 8.5 | 10.0 | 0.500 |
| Documentation | 10% | 10.0 | 10.0 | 1.000 |
| **Overall** | | **7.84** | | **9.71** |

**Why some dimensions sit just below 10 with no open finding:**
- **Referential integrity:** ids from other modules still have no foreign key, by design (DATA-019).
- **Indexing:** the 68 parent tenant keys add a small write cost.
- **Naming:** aliased names need the legend to read.
- **Normalization:** snapshot names are deliberate copies.

---

# First review (06-Nov-2026)

**Schema reviewed:** `docs/database/synapsedc_dc_store.sql`, generated by `scripts/db/build_schema.py` (BRD 1.0-rc4).

**How it was reviewed:**
- The schema was loaded into MySQL 9.6.
- Every fact below was read from `information_schema`: 109 tables, 1,707 columns, 124 foreign keys, 144 checks and 199 secondary indexes.
- No figure was estimated from the DDL text.

**Row counts:** none, because the schema is empty. So "allows" below means "the database accepts it". It does not mean "it has happened".

**Fixes (06-Nov-2026, now removed; the generator holds every fix):** `docs/database/synapsedc_dc_store_review_fixes.sql`.
- Section 1 holds the verification queries. Each must return no rows before the fixes run.
- Section 2 holds the fixes.
- The whole file ran cleanly on a fresh copy, giving 186 checks, 125 foreign keys and a rejected cross-tenant insert.
- The lasting fix still belongs in the generator, so the next generated `.sql` already includes it.

## Score and verdict

**Gate rule (hard):** Pass needs **zero Critical findings AND a score ≥ 7.0**. The two conditions are independent: one Critical finding fails the gate whatever the score.

| Dimension | Weight | Score | Weighted |
|---|---|---|---|
| 1. Referential integrity | 20% | 5.0 | 1.000 |
| 2. Indexing and performance | 18% | 9.0 | 1.620 |
| 3. Data type and storage | 12% | 9.0 | 1.080 |
| 4. Naming conventions | 8% | 9.0 | 0.720 |
| 5. Constraint completeness | 15% | 6.5 | 0.975 |
| 6. Normalization and redundancy | 12% | 8.5 | 1.020 |
| 7. Security and sensitive data | 5% | 8.5 | 0.425 |
| 8. Documentation accuracy | 10% | 10.0 | 1.000 |
| **Overall** | 100% | | **7.84 / 10** |

**Verdict: FAIL.** The score of 7.84 clears 7.0, but there is one Critical finding (C1).

**Findings:** 1 Critical, 3 Major and 7 Minor, 11 in total.

| Dimension | Critical | Major | Minor |
|---|---|---|---|
| Referential integrity | C1 | M1 | m1 |
| Indexing | | | m2 |
| Data types | | | m3 |
| Naming | | | m4 |
| Constraints | | M2, M3 | |
| Normalization | | | m5, m6 |
| Security | | | m7 |
| Documentation | | | |

Fixing C1 alone passes the gate. Fixing C1, M1, M2 and M3 brings the score to about 9.

---

## 1. Referential integrity (5.0)

### C1 · Critical · Tenant isolation is not enforced by any foreign key

**Where:** all 124 foreign keys. The central `PLAN` tree (43 child tables) is the biggest exposure. The others are the `PLAN_TEMPLATE_VERSION` tree, the `MACD_REQUEST`, `INCIDENT_ENRICHMENT` and `COMPLIANCE_POLICY` trees, and `LOOKUP_VALUE`.

**What is wrong:**
- Every table carries `TENANT_ID`, and every foreign key references only the parent's surrogate key.
- No foreign key includes `TENANT_ID`: zero of 124.
- So a child row's tenant and its parent's tenant are two unchecked copies of the same fact.

**Proof:** in the test database, a `LOOKUP_VALUE` row with tenant `tenant-B` was accepted under a `LOOKUP_LIST` row owned by `tenant-A`.

**Why it matters:** with one application bug, such as a missing tenant filter in a write path, a phase or approval or scenario of one operator's plan can attach to another operator's plan. After that:
- the owner's tenant-scoped queries (`WHERE TENANT_ID = ?`) silently miss the row;
- the other tenant's queries return a row that belongs to someone else's plan.

This is a data-isolation and correctness failure on the most-used tables.

**Fix:**
1. Give every referenced table a `UNIQUE (TENANT_ID, <TABLE>_ID)`.
2. Make each foreign key composite: `(TENANT_ID, col)`.
3. Change the 6 `ON DELETE SET NULL` keys to `RESTRICT`, because SET NULL would also try to null the NOT NULL `TENANT_ID`.

No check or generated column reads `TENANT_ID`, so MySQL's limits on cascading keys do not get in the way. The full schema took the change cleanly: 124 of 124 keys became tenant-aware.

Run the verification first. It is one query per foreign key and should return no rows:

```sql
SELECT 'FK_PLAN_PHASE_PLAN_ID' AS fk, COUNT(*) AS cross_tenant_rows
  FROM `PLAN_PHASE` c JOIN `PLAN` p ON p.`PLAN_ID` = c.`PLAN_ID`
 WHERE c.TENANT_ID <> p.TENANT_ID HAVING COUNT(*) > 0;
```

Then apply the change (example for one key; the fixes file holds all 124):

```sql
ALTER TABLE `PLAN` ADD UNIQUE KEY `UK_PLAN_TENANT_ID_PK` (`TENANT_ID`, `PLAN_ID`);
ALTER TABLE `PLAN_PHASE` DROP FOREIGN KEY `FK_PLAN_PHASE_PLAN_ID`;
ALTER TABLE `PLAN_PHASE` ADD CONSTRAINT `FK_PLAN_PHASE_PLAN_ID`
  FOREIGN KEY (`TENANT_ID`, `PLAN_ID`) REFERENCES `PLAN` (`TENANT_ID`, `PLAN_ID`)
  ON DELETE CASCADE ON UPDATE RESTRICT;
```

**In the generator:** `fk()` should emit `(TENANT_ID, col)`, and `table()` should add `UK_<T>_TENANT_ID_PK`.

### M1 · Major · `PLAN_SITE.REF_ID` holds a candidate plot by its code instead of by a key

**Where:** `PLAN_SITE.REF_ID VARCHAR(64)`.

**What is wrong:**
- When `REF_KIND = 'candidate'`, the column stores `PLAN_CANDIDATE_SITE.CANDIDATE_CODE` (its comment says so).
- `PLAN_CANDIDATE_SITE` lives in this same database, so the reference could be a real foreign key, but it isn't.

**Why it matters:**
- Renaming or deleting a candidate plot leaves the plan's site row pointing at nothing.
- A code from a different plan's candidates is also accepted.

This is the only reference inside DC-STORE that has no foreign key. Every other unenforced id belongs to a record in another module, which is by design (DATA-019).

**Fix:**

```sql
-- verify: candidate rows that match no plot of the same plan (expect none)
SELECT s.PLAN_SITE_ID FROM `PLAN_SITE` s LEFT JOIN `PLAN_CANDIDATE_SITE` c
  ON c.PLAN_ID = s.PLAN_ID AND c.CANDIDATE_CODE = s.REF_ID
 WHERE s.REF_KIND = 'candidate' AND c.PLAN_CANDIDATE_SITE_ID IS NULL;

ALTER TABLE `PLAN_SITE` ADD COLUMN `PLAN_CANDIDATE_SITE_ID` BIGINT UNSIGNED NULL
  COMMENT 'Candidate plot this row points at (REF_KIND = candidate)' AFTER `REF_ID`;
UPDATE `PLAN_SITE` s JOIN `PLAN_CANDIDATE_SITE` c ON c.PLAN_ID = s.PLAN_ID AND c.CANDIDATE_CODE = s.REF_ID
   SET s.PLAN_CANDIDATE_SITE_ID = c.PLAN_CANDIDATE_SITE_ID WHERE s.REF_KIND = 'candidate';
ALTER TABLE `PLAN_SITE` ADD KEY `IDX_PLAN_SITE_PLAN_CANDIDATE_SITE_ID` (`PLAN_CANDIDATE_SITE_ID`),
  ADD CONSTRAINT `FK_PLAN_SITE_PLAN_CANDIDATE_SITE_ID` FOREIGN KEY (`PLAN_CANDIDATE_SITE_ID`)
      REFERENCES `PLAN_CANDIDATE_SITE` (`PLAN_CANDIDATE_SITE_ID`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `CK_PLAN_SITE_CANDIDATE` CHECK ((`REF_KIND` = 'candidate') = (`PLAN_CANDIDATE_SITE_ID` IS NOT NULL));
```

After the backfill, `REF_ID` should be NULL for candidate rows.

### m1 · Minor · A review comment can point at another plan's review or another plan's comment

**Where:** `PLAN_REVIEW_COMMENT` columns `PLAN_ID`, `PLAN_REVIEW_ID` and `PARENT_COMMENT_ID`.

**What is wrong:** three separate keys reach the plan, and nothing makes them agree.
- A comment on plan A can carry `PLAN_REVIEW_ID` for a review of plan B.
- A reply can carry `PARENT_COMMENT_ID` for a comment on plan B.

**Why it matters:**
- The review page lists the comment under plan A.
- The thread or the "your review" count lists it under plan B.

**Fix:** make both keys composite with `PLAN_ID`. The review link then has to become `ON DELETE RESTRICT` instead of SET NULL, because SET NULL would also null `PLAN_ID`.

```sql
-- verify (expect no rows)
SELECT c.PLAN_REVIEW_COMMENT_ID FROM `PLAN_REVIEW_COMMENT` c JOIN `PLAN_REVIEW` r ON r.PLAN_REVIEW_ID = c.PLAN_REVIEW_ID WHERE r.PLAN_ID <> c.PLAN_ID;
SELECT c.PLAN_REVIEW_COMMENT_ID FROM `PLAN_REVIEW_COMMENT` c JOIN `PLAN_REVIEW_COMMENT` p ON p.PLAN_REVIEW_COMMENT_ID = c.PARENT_COMMENT_ID WHERE p.PLAN_ID <> c.PLAN_ID;

ALTER TABLE `PLAN_REVIEW` ADD UNIQUE KEY `UK_PLAN_REVIEW_PLAN_REVIEW_ID_PLAN_ID` (`PLAN_REVIEW_ID`, `PLAN_ID`);
ALTER TABLE `PLAN_REVIEW_COMMENT` DROP FOREIGN KEY `FK_PLAN_REVIEW_COMMENT_PLAN_REVIEW_ID`,
  ADD CONSTRAINT `FK_PLAN_REVIEW_COMMENT_PLAN_REVIEW_ID_PLAN_ID` FOREIGN KEY (`PLAN_REVIEW_ID`, `PLAN_ID`)
      REFERENCES `PLAN_REVIEW` (`PLAN_REVIEW_ID`, `PLAN_ID`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `PLAN_REVIEW_COMMENT` ADD UNIQUE KEY `UK_PLAN_REVIEW_COMMENT_ID_PLAN_ID` (`PLAN_REVIEW_COMMENT_ID`, `PLAN_ID`);
ALTER TABLE `PLAN_REVIEW_COMMENT` DROP FOREIGN KEY `FK_PLAN_REVIEW_COMMENT_PARENT_COMMENT_ID`,
  ADD CONSTRAINT `FK_PLAN_REVIEW_COMMENT_PARENT_COMMENT_ID_PLAN_ID` FOREIGN KEY (`PARENT_COMMENT_ID`, `PLAN_ID`)
      REFERENCES `PLAN_REVIEW_COMMENT` (`PLAN_REVIEW_COMMENT_ID`, `PLAN_ID`) ON DELETE RESTRICT ON UPDATE RESTRICT;
```

**Checked and fine:** child and parent column types match on every key (0 mismatches). The 26 other `*_ID` columns without a foreign key all name records in other modules (users, Inventory, ITSM, BSS, System Alerts), which DATA-019 rules out of foreign keys.

## 2. Indexing and performance (9.0)

### m2 · Minor · No estate-wide queue index on three operational tables

**Where:**
- `MACD_REQUEST.STAGE`
- `DCIM_WORK_ITEM.STATUS`
- `POWER_FINDING.STATUS`

**What is wrong:** each table has a `(TENANT_ID, INV_SITE_ID, STAGE/STATUS)` index, which serves the one-datacenter view. The estate-wide counts on Insights ask for "all open requests" without naming a site, and no index serves that.

**Why it matters:** without a site, MySQL scans every row of the tenant through the `TENANT_ID` prefix. That is fine today but grows with history. `PLAN` already has the right pair, `(TENANT_ID, STATUS)`.

**Fix:**

```sql
ALTER TABLE `MACD_REQUEST`   ADD KEY `IDX_MACD_REQUEST_TENANT_ID_STAGE`    (`TENANT_ID`, `STAGE`);
ALTER TABLE `DCIM_WORK_ITEM` ADD KEY `IDX_DCIM_WORK_ITEM_TENANT_ID_STATUS` (`TENANT_ID`, `STATUS`);
ALTER TABLE `POWER_FINDING`  ADD KEY `IDX_POWER_FINDING_TENANT_ID_STATUS`  (`TENANT_ID`, `STATUS`);
```

**Checked and fine:**
- No redundant index: no index matches, or is a prefix of, another one.
- No index on a boolean or date column alone.
- Every foreign-key column leads an index.
- 14 child-table STATUS columns are unindexed. That is correct, because those rows are always read through their parent key.

## 3. Data type and storage design (9.0)

### m3 · Minor · `COMPLIANCE_POLICY_VERSION.REGO_SOURCE` is MEDIUMTEXT

**What is wrong:** MEDIUMTEXT holds up to 16 MB. A Rego policy is a few KB, and TEXT holds 64 KB.

**Why it matters:**
- An oversized column invites misuse, such as pasting whole bundles.
- It raises the most memory a single row read can take.

**Fix:**

```sql
-- verify: largest stored source (must be < 65,535 bytes)
SELECT MAX(LENGTH(REGO_SOURCE)) FROM `COMPLIANCE_POLICY_VERSION`;
ALTER TABLE `COMPLIANCE_POLICY_VERSION` MODIFY `REGO_SOURCE` TEXT NOT NULL COMMENT 'Rego source (policy as code, up to 64 KB)';
```

**Checked and fine:**
- Only one column name carries more than one type: `STATUS`, which has 17 ENUMs, one per entity lifecycle. Each is a different state machine, so this is not type drift. The shared version lifecycle uses the single `VERSION_STATUS` enum everywhere.
- No FLOAT or DOUBLE; money is DECIMAL.
- Every id is ascii `VARCHAR(64)`.
- Only five JSON columns, each a snapshot or payload.

## 4. Naming conventions (9.0)

### m4 · Minor · 24 constraint and index names end in an opaque hash

**Example:** `UK_COMPLIANCE_CONTROL_POLICY_COMPLIANCE_CONTROL_ID_COMP_BCCD0E59`.

**What is wrong:** the generator truncates names over MySQL's 64-character limit and adds 8 hex digits.

**Why it matters:** the names are unique and stable, but a DBA reading an error such as `Duplicate entry … for key '…_BCCD0E59'` cannot tell which columns the key covers.

**Fix:** in `short()`, shorten by role instead of by hash. Use the table's short alias plus column abbreviations, for example `UK_CCP_CONTROL_POLICY`. One rename for the example:

```sql
ALTER TABLE `COMPLIANCE_CONTROL_POLICY` RENAME INDEX `UK_COMPLIANCE_CONTROL_POLICY_COMPLIANCE_CONTROL_ID_COMP_BCCD0E59` TO `UK_CCP_CONTROL_POLICY`;
```

**Checked and fine:**
- Every primary key is `<TABLE>_ID`: 109 of 109.
- Every index, check and foreign key follows `UK_` / `IDX_` / `CK_` / `FK_`.
- All names are SNAKE_UPPER_CASE.
- No name is left over from a rename.

## 5. Constraint completeness (6.5)

### M2 · Major · 41 numeric columns accept negatives or impossible percentages

**What is wrong:** 45 signed numeric columns have no CHECK. Four of them are signed on purpose and stay as they are:
- `MACD_REQUEST.KW_DELTA`, `MRC_DELTA` and `U_DELTA` (a request can remove capacity);
- `PLAN_TEMPLATE_RULE.THRESHOLD`.

The other 41 are money, kW, kVA, km, latency and percentages. Examples:
- `PLAN_BASELINE.SOURCED_TOTAL_USD`, `PLAN_SITE.CAPEX_USD`, `PLAN_CLOSEOUT.MEASURED_KW`, `PLAN_NETWORK_PATH.LATENCY_MS`;
- seven `*_PCT` columns: `PLAN_TEMPLATE_DEMAND_PHASE.SHARE_PCT`, `PLAN_BASELINE.READINESS_PCT`, `INCIDENT_RCA_HYPOTHESIS.CONFIDENCE_PCT`, `GPU_MODEL_BENCHMARK.HELD_BACK_BELOW_PCT`, `PLAN_SITE_TYPE.COOLING_HEADROOM_MIN_PCT`, `PLAN.GROWTH_PCT_PER_YEAR` and `POWER_CONTRACT.ESCALATOR_PCT`.

**Why it matters:**
- A sign error in an import or API call stores `CAPEX_USD = -2.5M`, and the frozen baseline (the approval record) keeps it.
- A `SHARE_PCT` of 140 breaks the template's demand phases, which must add up to 100.
- `CONFIDENCE_PCT = 250` puts an RCA hypothesis above every real one.

**Fix:** the fixes file has all 41 checks, plus one verification query per column. Examples:

```sql
SELECT COUNT(*) FROM `PLAN_SITE` WHERE NOT (`CAPEX_USD` >= 0);   -- expect 0
ALTER TABLE `PLAN_SITE` ADD CONSTRAINT `CK_PLAN_SITE_CAPEX_USD_RANGE` CHECK (`CAPEX_USD` >= 0);
ALTER TABLE `PLAN_TEMPLATE_DEMAND_PHASE` ADD CONSTRAINT `CK_PLAN_TEMPLATE_DEMAND_PHASE_SHARE_PCT_RANGE` CHECK (`SHARE_PCT` BETWEEN 0 AND 100);
ALTER TABLE `PLAN_SITE_TYPE` ADD CONSTRAINT `CK_PLAN_SITE_TYPE_BUILD_DURATION_FACTOR_RANGE` CHECK (`BUILD_DURATION_FACTOR` > 0);
```

**In the generator:** `c()` should add `>= 0` for any DECIMAL or INT that is not marked `signed=True`, and `BETWEEN 0 AND 100` for `*_PCT`.

### M3 · Major · Two composite unique keys contain a nullable column

**Where:**
- `UK_PLAN_EQUIPMENT_LINE_PLAN_ID_ASSET_MODEL_KEY_ROLE`: `ROLE` is nullable.
- `UK_PLAN_PLACEMENT_LINK_…` on `(PLAN_PLACEMENT_RACK_ID, LINK_KIND, INV_RECORD_ID, INTERFACE_NAME)`: `INTERFACE_NAME` is nullable.

**What is wrong:** in MySQL, NULL never equals NULL. So two rows `(plan 7, R760, NULL)` are both accepted.

**Why it matters:** a duplicated equipment line doubles that model in the bill of materials. That feeds CapEx and Delivery's purchase orders.

**Fix:**

```sql
-- verify (expect no rows)
SELECT PLAN_ID, ASSET_MODEL_KEY, COALESCE(ROLE,'') k, COUNT(*) FROM `PLAN_EQUIPMENT_LINE` GROUP BY PLAN_ID, ASSET_MODEL_KEY, k HAVING COUNT(*) > 1;
SELECT PLAN_PLACEMENT_RACK_ID, LINK_KIND, INV_RECORD_ID, COALESCE(INTERFACE_NAME,'') k, COUNT(*) FROM `PLAN_PLACEMENT_LINK`
 GROUP BY PLAN_PLACEMENT_RACK_ID, LINK_KIND, INV_RECORD_ID, k HAVING COUNT(*) > 1;

ALTER TABLE `PLAN_EQUIPMENT_LINE` MODIFY `ROLE` VARCHAR(50) NOT NULL DEFAULT '' COMMENT 'Role; empty = no role';
ALTER TABLE `PLAN_PLACEMENT_LINK` MODIFY `INTERFACE_NAME` VARCHAR(50) NOT NULL DEFAULT '' COMMENT 'Interface (ports); empty = whole device';
```

**Checked and fine:**
- There are 144 CHECK constraints. They cover latitude/longitude ranges on both site tables, workload mixes that must add up to 100, low ≤ typical ≤ high, date order, "Resolved needs a resolved time", and the WRITEBACK_REQUEST "exactly one source" rule.
- The other nullable columns in unique keys are deliberate generated keys that are NULL when the rule does not apply: `LIVE_KEY`, `OPEN_DRAFT_KEY`, `PENDING_KEY`, `PREFERRED_KEY`, `OPEN_ROUND_KEY`, `OPEN_FINDING_KEY` and `ACTIVE_CASE_KEY`. This is the correct MySQL pattern for a partial unique index.
- Every junction table has a unique key on the pair it maps.

## 6. Normalization and redundancy (8.5)

### m5 · Minor · 13 cached display names have no stated refresh rule

**Where:**
- `PLAN.OWNER_NAME`, `PLAN_APPROVAL.APPROVER_NAME`, `PLAN_CONSENT.CUSTOMER_NAME`;
- `PLAN_REVIEW_COMMENT.AUTHOR_NAME` and `SECTION_LABEL`, `PLAN_REVIEW_REVIEWER.REVIEWER_NAME`;
- `APPROVAL_DELEGATION.FROM_NAME` and `TO_NAME`;
- `COMPLIANCE_DECISION.RESOURCE_NAME`, `INCIDENT_IMPACT_ITEM.ITEM_LABEL`, `PLAN_DISPOSITION.LABEL`, `PLAN_NETWORK_PATH.PROVIDER_NAME`, `PLAN_PLANT_LINE.TARGET_ASSET_LABEL`.

**What is wrong:** each column copies a name owned by another module, and its comment only says "Name cached".

**Why it matters:**
- On approvals and comments the copy is correct: the name as it was when the person signed is the record.
- On `PLAN.OWNER_NAME` and `PLAN_CONSENT.CUSTOMER_NAME` a rename in Platform Engineering or BSS leaves the plan showing the old name, and nothing says whether that is intended.

**Fix:** decide per column, then either:
- document it as a snapshot ("as at signing"), or
- drop it and read the name through the module's API.

```sql
ALTER TABLE `PLAN_APPROVAL` MODIFY `APPROVER_NAME` VARCHAR(200) NOT NULL COMMENT 'Approver name as at the decision (snapshot, never refreshed)';
ALTER TABLE `PLAN` DROP COLUMN `OWNER_NAME`;   -- read from Platform Engineering by OWNER_USER_ID
```

### m6 · Minor · Three near-identical "open item" vocabularies

**Where:**
- `ENUM('Open','Resolved')` on `PLAN_REVIEW_COMMENT`;
- `ENUM('Open','Closed')` on `PLAN_CONDITION`;
- `ENUM('Open','Resolved','Dismissed')` on `POWER_FINDING`.

**Why it matters:** reports that count "open items" across tables have to know that the closed state is spelled three ways.

**Fix:** use one shared enum, `ITEM_STATUS = ('Open','Resolved','Dismissed')`, the same way `VERSION_STATUS` is shared.

```sql
-- verify: values that would need mapping
SELECT STATUS, COUNT(*) FROM `PLAN_CONDITION` GROUP BY STATUS;
ALTER TABLE `PLAN_CONDITION` MODIFY `STATUS` ENUM('Open','Closed','Resolved','Dismissed') NOT NULL DEFAULT 'Open' COMMENT 'State';
UPDATE `PLAN_CONDITION` SET STATUS = 'Resolved' WHERE STATUS = 'Closed';
ALTER TABLE `PLAN_CONDITION` MODIFY `STATUS` ENUM('Open','Resolved','Dismissed') NOT NULL DEFAULT 'Open' COMMENT 'State';
```

**Checked and fine:**
- No repeating column groups (`X1`, `X2` …).
- No comma-separated values in cells.
- Versioned content is split into identity and version tables.
- Lookups are governed by `LOOKUP_LIST` / `LOOKUP_VALUE`.

## 7. Security and sensitive data (8.5)

### m7 · Minor · `PLAN_REVIEW_REVIEWER.EMAIL` stores a personal address in plain text

**What is wrong:** every other person in the schema is held as a Platform Engineering user id. This one table also keeps `EMAIL VARCHAR(320)`, which its own comment marks as "personal data". Your MySQL guidelines say to hash or encrypt sensitive data.

**Why it matters:**
- A copy of DC-STORE, such as a backup or an analytics extract, exposes reviewers' addresses.
- The address goes stale when the user's email changes.

**Fix:** drop the column and resolve the address from `REVIEWER_USER_ID` when the pack is sent. If a record of the exact address is required, keep `AES_ENCRYPT` output in a `VARBINARY` column instead.

```sql
ALTER TABLE `PLAN_REVIEW_REVIEWER` DROP COLUMN `EMAIL`;
```

**Checked and fine:** there is no password, secret, token or key column.

**What a static export cannot show:** encryption at rest, column masking, grants, and the platform's audit trail (by your decision, DC-STORE has no AUD tables).

## 8. Documentation accuracy (10.0)

No findings.
- All 109 tables and all 1,707 columns carry a comment.
- Every table has a header with its purpose, related tables and update date.
- Every claim in the comments is backed by a constraint:
  - "at most one preferred per plan" on `PLAN_SCENARIO` matches `UK_PLAN_SCENARIO_PREFERRED_KEY`;
  - "makes active cases unique" on `BENCHMARK.ACTIVE_CASE_KEY` matches its unique key;
  - every "references X" points at a real foreign key.
- The one comment that names a column not backed by a foreign key is `PLAN_SITE.REF_ID`, already reported as M1.

---

## Working well

- **Referential coverage inside the store is complete except M1.** All 124 foreign keys have matching child and parent types, and every foreign-key column leads an index.
- **Partial uniqueness is done correctly.** Generated STORED keys that are NULL when the rule does not apply enforce "one open draft per template", "one published version", "one preferred scenario", "one open approval round", "one open finding per contract and kind" and "one active benchmark per case". Tested: a second draft and a second preferred scenario were rejected, and reusing a retired benchmark case was allowed.
- **Business rules live in the database.** 144 checks, including the write-back "exactly one source" rule and workload mixes that must add up to 100.
- **Module boundaries are explicit.** Ids from other modules use prefixes such as `INV_`, `ITSM_` and `BSS_`, are ascii `VARCHAR(64)`, and have no foreign keys by design (DATA-019). The column name alone tells a reader where the record lives.
- **Every tenant-facing natural key is unique per tenant.** Plan code plus revision, request code, batch code and the idempotency key all lead with `TENANT_ID`.
- **No redundant or low-value indexes.**
- **Documentation is complete,** at 100% of tables and columns.
- **Types are disciplined.** No FLOAT, money is DECIMAL, only five JSON columns (snapshots and payloads only), and one shared `VERSION_STATUS` lifecycle.

## Next step

Apply C1, M1, M2 and M3 in `scripts/db/build_schema.py` and regenerate. The Minor items can follow. Re-review against this report's finding ids and mark each one fixed, partially fixed or still open.
