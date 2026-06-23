import { useState } from "react";

const CARDS = [
  {
    q: "What type of chickens does Amir Specialty Poultry process?",
    a: "Multiple types classified by breed, size, market demand, and cultural preference.",
  },
  {
    q: "Who determines the pricing for all birds processed by Amir Specialty Poultry?",
    a: "The Chicken Farmers of Ontario (CFO).",
  },
  {
    q: "What are the two main categories of chickens processed?",
    a: "Traditional Chickens and Specialty Chickens.",
  },
  { q: "What is the weight range for Broilers?", a: "Approximately 3-4 lbs." },
  { q: "How are Roasters sold?", a: "Whole or Hong Kong dressed for specific markets." },
  { q: "What is the weight range for Roasters?", a: "Approximately 6-8 lbs (around 3.8 kg)." },
  { q: "How often are Free Run Chickens processed?", a: "Three days per week." },
  {
    q: "What is a unique characteristic of Silkies?",
    a: "They have black skin and are culturally preferred by Asian markets.",
  },
  { q: "On which day are Silkies processed?", a: "One day per week." },
  {
    q: "What is the approximate volume of Broilers processed on Mondays?",
    a: "6,000-11,000 birds/day.",
  },
  {
    q: "What is the processing volume for Free Run Chickens on Tuesdays?",
    a: "8,000-11,000 birds/day.",
  },
  {
    q: "What is the role of the Chicken Farmers of Ontario (CFO) in chicken production?",
    a: "Regulates chicken production through a quota system.",
  },
  {
    q: "What does the quota system ensure?",
    a: "Food safety, supply stability, and fair returns for farmers.",
  },
  { q: "How long is each quota period in the Ontario chicken industry?", a: "Eight weeks." },
  {
    q: "What happens if quota requirements are not met?",
    a: "It may result in loss of production rights.",
  },
];

function ChevronIcon({ direction = "left" }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d={direction === "left" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"}
      />
    </svg>
  );
}

export default function AqmPoultryFlashcards() {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const total = CARDS.length;
  const card = CARDS[index];

  function goTo(next) {
    setIndex(((next % total) + total) % total);
    setFlipped(false);
  }

  return (
    <div className="w-full min-w-0">
      <div className="mb-4 flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">Poultry processing flashcards</h2>
        <span className="text-xs font-medium tabular-nums text-slate-400 dark:text-slate-500">
          {index + 1} / {total}
        </span>
      </div>

      <div className="mb-5 h-1 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#0B3EAF] to-sky-400 transition-all duration-300"
          style={{ width: `${((index + 1) / total) * 100}%` }}
        />
      </div>

      <div className="flex items-center gap-2 sm:gap-5">
        <button
          type="button"
          onClick={() => goTo(index - 1)}
          aria-label="Previous card"
          className="shrink-0 rounded-full border border-slate-200 bg-white p-2.5 text-slate-400 shadow-sm transition hover:border-[#0B3EAF]/30 hover:text-[#0B3EAF] hover:shadow-md active:scale-95 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500"
        >
          <ChevronIcon direction="left" />
        </button>

        <div
          role="button"
          tabIndex={0}
          onClick={() => setFlipped((f) => !f)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setFlipped((f) => !f);
            }
          }}
          className="relative min-h-[200px] w-full flex-1 cursor-pointer overflow-hidden rounded-3xl border border-slate-200/70 bg-gradient-to-br from-white to-slate-50 p-6 text-center shadow-lg shadow-slate-200/70 sm:min-h-[260px] sm:p-10 dark:border-slate-700 dark:from-slate-900 dark:to-slate-950 dark:shadow-none"
        >
          <div className="flex h-full min-h-[150px] items-center justify-center sm:min-h-[200px]">
            <p
              className={[
                "max-w-lg text-lg font-semibold leading-snug transition-all duration-300 sm:text-xl",
                flipped
                  ? "absolute translate-y-2 opacity-0"
                  : "translate-y-0 text-slate-900 opacity-100 dark:text-white",
              ].join(" ")}
            >
              {card.q}
            </p>
            <p
              className={[
                "max-w-lg text-lg font-semibold leading-snug text-[#0B3EAF] transition-all duration-300 sm:text-xl dark:text-sky-300",
                flipped ? "translate-y-0 opacity-100" : "absolute -translate-y-2 opacity-0",
              ].join(" ")}
            >
              {card.a}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => goTo(index + 1)}
          aria-label="Next card"
          className="shrink-0 rounded-full border border-slate-200 bg-white p-2.5 text-slate-400 shadow-sm transition hover:border-[#0B3EAF]/30 hover:text-[#0B3EAF] hover:shadow-md active:scale-95 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500"
        >
          <ChevronIcon direction="right" />
        </button>
      </div>

      <div className="mt-3 text-center text-[11px] text-slate-400 dark:text-slate-500">Tap the card to flip</div>
    </div>
  );
}
