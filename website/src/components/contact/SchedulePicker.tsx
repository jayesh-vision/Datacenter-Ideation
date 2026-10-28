"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Icon } from "../Icon";

/**
 * Themed date and time pickers for the demo form (ported from the Opstral website, 28-Oct-2026).
 *
 * WHY THIS EXISTS. `<input type="date">` is the right control on paper, but the
 * panel it opens is drawn by the browser as chrome, not as page content: its
 * internals are unreachable from CSS and `color-scheme` only reaches some of
 * them. Firefox in particular renders a white calendar over the dark page and
 * there is no styling hook for it. Matching the site meant owning the panel.
 *
 * WHAT IS PRESERVED. The form still submits the same two fields, with the same
 * names and the same machine formats — `meetingDate` as YYYY-MM-DD and
 * `meetingTime` as 24-hour HH:MM — through hidden inputs. Nothing downstream
 * knows the control changed.
 *
 * TIME IS A LIST, NOT A CLOCK. You are booking a slot with a team, not
 * recording an arbitrary timestamp, so the field offers the slots that can
 * actually be booked. That removes a whole class of input error — 3am, half
 * past seven, a typo'd hour — and is faster than typing.
 *
 * ACCESSIBILITY. The calendar is a real grid: arrow keys move by day, Page
 * Up/Down by month, Home/End to the ends of the week, Escape closes and returns
 * focus to the trigger. Only one day is tabbable at a time, which is the
 * expected pattern for a grid — tabbing through forty-two cells is not.
 */

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Bookable slots, in 24-hour time. */
const SLOTS = (() => {
	const out: string[] = [];
	for (let h = 9; h <= 17; h++) {
		out.push(`${String(h).padStart(2, "0")}:00`);
		if (h < 17) out.push(`${String(h).padStart(2, "0")}:30`);
	}
	return out;
})();

/** YYYY-MM-DD in LOCAL time. `toISOString` would shift the day either side of UTC. */
function toKey(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
		d.getDate(),
	).padStart(2, "0")}`;
}

function fromKey(key: string): Date | null {
	const [y, m, d] = key.split("-").map(Number);
	return y && m && d ? new Date(y, m - 1, d) : null;
}

function startOfDay(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Monday-first offset for a month's first cell. */
function leadingBlanks(year: number, month: number): number {
	return (new Date(year, month, 1).getDay() + 6) % 7;
}

function formatLong(d: Date): string {
	return d.toLocaleDateString(undefined, {
		weekday: "short",
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

function formatSlot(hhmm: string): string {
	const [h, m] = hhmm.split(":").map(Number);
	const suffix = h < 12 ? "am" : "pm";
	const hour = h % 12 === 0 ? 12 : h % 12;
	return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Closes a popover on outside click and on Escape. */
function useDismiss(open: boolean, close: () => void, refs: React.RefObject<HTMLElement | null>[]) {
	useEffect(() => {
		if (!open) return;

		const onPointer = (e: PointerEvent) => {
			const t = e.target as Node;
			if (refs.some((r) => r.current?.contains(t))) return;
			close();
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.stopPropagation();
				close();
			}
		};

		document.addEventListener("pointerdown", onPointer, true);
		document.addEventListener("keydown", onKey, true);
		return () => {
			document.removeEventListener("pointerdown", onPointer, true);
			document.removeEventListener("keydown", onKey, true);
		};
	}, [open, close, refs]);
}

export default function SchedulePicker({ tz }: { tz: string }) {
	const today = useMemo(() => startOfDay(new Date()), []);

	const [dateKey, setDateKey] = useState("");
	const [time, setTime] = useState("");

	const selected = dateKey ? fromKey(dateKey) : null;
	const [view, setView] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

	// The day arrow keys are currently on. Tracked separately from the
	// selection: you move through the grid before committing to a date.
	const [cursor, setCursor] = useState<Date>(today);

	const [dateOpen, setDateOpen] = useState(false);
	const [timeOpen, setTimeOpen] = useState(false);

	const dateWrap = useRef<HTMLDivElement>(null);
	const timeWrap = useRef<HTMLDivElement>(null);
	const dateTrigger = useRef<HTMLButtonElement>(null);
	const timeTrigger = useRef<HTMLButtonElement>(null);
	const gridRef = useRef<HTMLDivElement>(null);

	const dateId = useId();
	const timeId = useId();

	useDismiss(dateOpen, () => setDateOpen(false), [dateWrap]);
	useDismiss(timeOpen, () => setTimeOpen(false), [timeWrap]);

	// Move DOM focus with the cursor, but only while the panel is open and only
	// in response to keyboard movement — otherwise opening the panel would yank
	// focus off the trigger.
	const moved = useRef(false);
	useEffect(() => {
		if (!dateOpen || !moved.current) return;
		moved.current = false;
		gridRef.current
			?.querySelector<HTMLButtonElement>('[data-cursor="true"]')
			?.focus();
	}, [cursor, dateOpen, view]);

	const openDate = () => {
		setCursor(selected ?? today);
		setView(new Date((selected ?? today).getFullYear(), (selected ?? today).getMonth(), 1));
		setDateOpen(true);
	};

	const closeDate = (returnFocus = true) => {
		setDateOpen(false);
		if (returnFocus) dateTrigger.current?.focus();
	};

	const pick = (d: Date) => {
		setDateKey(toKey(d));
		closeDate();
	};

	const shiftCursor = (days: number) => {
		const next = new Date(cursor);
		next.setDate(next.getDate() + days);
		moved.current = true;
		setCursor(next);
		setView(new Date(next.getFullYear(), next.getMonth(), 1));
	};

	const onGridKey = (e: React.KeyboardEvent) => {
		const keys: Record<string, number> = {
			ArrowLeft: -1,
			ArrowRight: 1,
			ArrowUp: -7,
			ArrowDown: 7,
		};
		if (e.key in keys) {
			e.preventDefault();
			shiftCursor(keys[e.key]);
			return;
		}
		if (e.key === "PageUp" || e.key === "PageDown") {
			e.preventDefault();
			const next = new Date(cursor);
			next.setMonth(next.getMonth() + (e.key === "PageUp" ? -1 : 1));
			moved.current = true;
			setCursor(next);
			setView(new Date(next.getFullYear(), next.getMonth(), 1));
			return;
		}
		if (e.key === "Home" || e.key === "End") {
			e.preventDefault();
			// Monday..Sunday, so Home is the Monday of this row.
			const dow = (cursor.getDay() + 6) % 7;
			shiftCursor(e.key === "Home" ? -dow : 6 - dow);
		}
	};

	const year = view.getFullYear();
	const month = view.getMonth();
	const daysInMonth = new Date(year, month + 1, 0).getDate();
	const blanks = leadingBlanks(year, month);

	return (
		<div className="ct-slot">
			{/* ------------------------------------------------------------- date */}
			<div className="ct-pick" ref={dateWrap}>
				<span className="ct-pick-label" id={`${dateId}-label`}>
					Preferred date
				</span>
				<button
					type="button"
					ref={dateTrigger}
					className={`ct-pick-trigger${dateOpen ? " is-open" : ""}`}
					aria-haspopup="dialog"
					aria-expanded={dateOpen}
					aria-labelledby={`${dateId}-label ${dateId}-value`}
					onClick={() => (dateOpen ? closeDate(false) : openDate())}
				>
					<span
						id={`${dateId}-value`}
						className={`ct-pick-value${selected ? "" : " is-empty"}`}
					>
						{selected ? formatLong(selected) : "Choose a date"}
					</span>
					<Icon name="calendar" size={17} />
				</button>

				{dateOpen ? (
					<div className="ct-pop" role="dialog" aria-label="Choose a date">
						<div className="ct-cal-head">
							<button
								type="button"
								className="ct-cal-nav"
								aria-label="Previous month"
								onClick={() => setView(new Date(year, month - 1, 1))}
							>
								<Icon name="chevron-left" size={15} />
							</button>
							<span className="ct-cal-month" aria-live="polite">
								{view.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
							</span>
							<button
								type="button"
								className="ct-cal-nav"
								aria-label="Next month"
								onClick={() => setView(new Date(year, month + 1, 1))}
							>
								<Icon name="chevron-right" size={15} />
							</button>
						</div>

						<div className="ct-cal-dow" aria-hidden="true">
							{WEEKDAYS.map((d) => (
								<span key={d}>{d}</span>
							))}
						</div>

						<div
							className="ct-cal-grid"
							role="grid"
							ref={gridRef}
							onKeyDown={onGridKey}
						>
							{Array.from({ length: blanks }).map((_, i) => (
								<span key={`b${i}`} className="ct-cal-blank" />
							))}

							{Array.from({ length: daysInMonth }).map((_, i) => {
								const d = new Date(year, month, i + 1);
								const key = toKey(d);
								const past = d < today;
								const isCursor = toKey(cursor) === key;
								const isSelected = dateKey === key;

								return (
									<button
										key={key}
										type="button"
										role="gridcell"
										aria-selected={isSelected}
										aria-current={toKey(today) === key ? "date" : undefined}
										data-cursor={isCursor}
										// One tab stop for the whole grid: arrows move within it.
										tabIndex={isCursor ? 0 : -1}
										disabled={past}
										className={[
											"ct-cal-day",
											isSelected ? "is-selected" : "",
											toKey(today) === key ? "is-today" : "",
										]
											.filter(Boolean)
											.join(" ")}
										onClick={() => pick(d)}
									>
										{i + 1}
									</button>
								);
							})}
						</div>

						<div className="ct-pop-foot">
							<button
								type="button"
								className="ct-pop-clear"
								onClick={() => {
									setDateKey("");
									closeDate();
								}}
							>
								Clear
							</button>
							<button
								type="button"
								className="ct-pop-today"
								onClick={() => pick(today)}
							>
								Today
							</button>
						</div>
					</div>
				) : null}
			</div>

			{/* ------------------------------------------------------------- time */}
			<div className="ct-pick" ref={timeWrap}>
				<span className="ct-pick-label" id={`${timeId}-label`}>
					Preferred time
				</span>
				<button
					type="button"
					ref={timeTrigger}
					className={`ct-pick-trigger${timeOpen ? " is-open" : ""}`}
					aria-haspopup="listbox"
					aria-expanded={timeOpen}
					aria-labelledby={`${timeId}-label ${timeId}-value`}
					onClick={() => setTimeOpen((o) => !o)}
				>
					<span id={`${timeId}-value`} className={`ct-pick-value${time ? "" : " is-empty"}`}>
						{time ? formatSlot(time) : "Choose a time"}
					</span>
					<Icon name="clock" size={17} />
				</button>

				{timeOpen ? (
					<div className="ct-pop ct-pop--times" role="listbox" aria-label="Choose a time">
						{SLOTS.map((s) => (
							<button
								key={s}
								type="button"
								role="option"
								aria-selected={time === s}
								className={`ct-time${time === s ? " is-selected" : ""}`}
								onClick={() => {
									setTime(s);
									setTimeOpen(false);
									timeTrigger.current?.focus();
								}}
							>
								{formatSlot(s)}
							</button>
						))}
					</div>
				) : null}
			</div>

			{/*
			 * The values the server actually reads. Same names and same machine
			 * formats the native inputs submitted, so the API is untouched.
			 */}
			<input type="hidden" name="meetingDate" value={dateKey} />
			<input type="hidden" name="meetingTime" value={time} />
			{/* Sent so a slot is never read in the wrong timezone. */}
			<input type="hidden" name="meetingTz" value={tz} />
		</div>
	);
}
