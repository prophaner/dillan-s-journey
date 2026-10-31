// S14 zones editor: four cutoffs, strictly increasing (brief "Zone model": Z1 < b1; Z2 [b1,b2);
// Z3 [b2,b3); Z4 [b3,b4); Z5 >= b4). Nothing is estimated: the starting values are labelled as
// generic placeholders until the user confirms them.

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { zoneRangeLabel, type ZoneNumber } from "@/v1/core/zones";
import type { ZoneConfig, ZoneCutoffs } from "@/v1/core/types";
import { DButton } from "@/components/dillan/button";
import { Banner } from "@/components/dillan/surfaces";
import { Eyebrow, Field, TextInput } from "@/components/dillan/form-pieces";
import { cn } from "@/lib/utils";

import { SUGGESTED_ZONES, zoneFieldErrors } from "./zones-model";

const ZONE_TEXT = ["text-z1", "text-z2", "text-z3", "text-z4", "text-z5"];

export function ZonesEditor({
  config,
  onConfirm,
  busy,
}: {
  config: ZoneConfig | null;
  onConfirm: (c: ZoneCutoffs) => void;
  busy?: boolean;
}) {
  const initial = useMemo(
    () => (config ? [config.b1, config.b2, config.b3, config.b4] : SUGGESTED_ZONES).map(String),
    [config],
  );
  const [values, setValues] = useState<string[]>(initial);
  const [shown, setShown] = useState(false);
  useEffect(() => setValues(initial), [initial]);

  const errs = zoneFieldErrors(values);
  const nums = values.map(Number) as ZoneCutoffs;
  const confirmed = !!config?.confirmed_at;
  const changed = values.join(",") !== initial.join(",");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setShown(true);
    if (errs) {
      const i = errs.findIndex(Boolean);
      document.getElementById(`zone-${i}`)?.focus();
      return;
    }
    onConfirm(nums);
  };

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-subhead text-text-2">
        Enter four increasing boundaries. Zone 1 is everything below the first number; Zone 5 is
        everything from the fourth number up.
      </p>
      {!config && (
        <Banner>
          <strong className="block">Suggested starting values</strong>
          These are generic placeholders, not a recommendation. Edit them to match the ranges you
          already use.
        </Banner>
      )}
      {[0, 1, 2, 3].map((i) => (
        <Field
          key={i}
          label={`Zone ${i + 1} → Zone ${i + 2} boundary (bpm)`}
          htmlFor={`zone-${i}`}
          error={(shown || changed) && errs ? (errs[i] ?? null) : null}
        >
          <TextInput
            id={`zone-${i}`}
            inputMode="numeric"
            value={values[i]}
            invalid={!!((shown || changed) && errs?.[i])}
            className="font-num tabular"
            onChange={(e) => {
              const v = e.target.value.replace(/[^\d]/g, "").slice(0, 3);
              setValues((all) => all.map((x, j) => (j === i ? v : x)));
            }}
          />
        </Field>
      ))}
      <div className="rounded-card bg-surface-2 p-4">
        <Eyebrow>Preview</Eyebrow>
        <dl className="mt-2 grid grid-cols-[1fr_auto] gap-y-1.5">
          {([1, 2, 3, 4, 5] as ZoneNumber[]).map((z) => (
            <div key={z} className="contents">
              <dt className={cn("font-bold", ZONE_TEXT[z - 1])}>Zone {z}</dt>
              <dd className="text-right font-num tabular text-text-2">
                {errs ? "—" : zoneRangeLabel(z, nums)}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <DButton type="submit" variant="primary" loading={!!busy} disabled={!!busy}>
        Confirm zones
      </DButton>
      <p className="text-footnote text-text-2">
        {confirmed ? "Zones confirmed. " : ""}These are Dillan's zones. Set them yourself; nothing
        is estimated. Changes apply to workouts you start afterwards.
      </p>
    </form>
  );
}
