"use client";

import { useEffect, useState } from "react";

/** A quiet warning when the edition on screen is more than a day old: the robot has not printed. */
export function StaleNotice({ editionDate }: { editionDate: string }) {
  const [daysLate, setDaysLate] = useState(0);
  useEffect(() => {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const diff = Math.round((new Date(today + "T12:00:00Z").getTime() - new Date(editionDate + "T12:00:00Z").getTime()) / 86400000);
    setDaysLate(diff);
  }, [editionDate]);
  if (daysLate < 2) return null;
  return (
    <p className="recap__note" style={{ margin: "10px 2px 0", padding: "10px 14px", background: "#FBF0D2", color: "#8C5E00", borderRadius: 12 }}>
      This edition is {daysLate} days old — the morning robot hasn't printed since. Alex, have a look at the GitHub Actions page.
    </p>
  );
}
