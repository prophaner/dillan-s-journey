import { useState } from "react";
import { useOutbox } from "@/lib/use-outbox";
import { queueRowUpdate, useProfileRow, useUnits } from "@/lib/use-profile";
import { UPDATE_PROFILE, type Units } from "@/lib/profile";
import { Chip } from "./tags";
import { Banner, Card } from "./surfaces";

/** Units (lb/kg, in/cm) in profiles.preferences.units. Changes the display only; stored entries keep their unit. */
export function UnitsControl({ uid }: { uid: string }) {
  const outbox = useOutbox(uid);
  const profile = useProfileRow(uid);
  const units = useUnits(uid, outbox.items);
  const [failed, setFailed] = useState(false);
  const set = async (next: Units) => {
    if (!profile.data) return;
    try {
      setFailed(false);
      await queueRowUpdate(uid, outbox.add, UPDATE_PROFILE, profile.data, { units: next }, () => void outbox.syncNow());
    } catch { setFailed(true); }
  };
  const disabled = !profile.data;
  return (
    <Card>
      <p className="text-headline font-bold">Units</p>
      <p className="mt-1 text-footnote text-text-2">Changes how numbers are shown. What you entered is kept as you typed it.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Weight unit">
        <span className="w-16 text-subhead text-text-2">Weight</span>
        {(["lb", "kg"] as const).map((u) => <Chip key={u} disabled={disabled} selected={units.weight === u} onClick={() => void set({ ...units, weight: u })}>{u === "lb" ? "Pounds (lb)" : "Kilograms (kg)"}</Chip>)}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2" role="group" aria-label="Length unit">
        <span className="w-16 text-subhead text-text-2">Length</span>
        {(["in", "cm"] as const).map((u) => <Chip key={u} disabled={disabled} selected={units.length === u} onClick={() => void set({ ...units, length: u })}>{u === "in" ? "Inches (in)" : "Centimeters (cm)"}</Chip>)}
      </div>
      {failed && <Banner className="mt-3">That didn't save on this device. This browser isn't keeping data between visits (private mode or storage full).</Banner>}
    </Card>
  );
}
