/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { instantiateLearnedMotion } from "@diffusionstudio/editing-playbook/motion-learned";
import type { LearnedMotion } from "@diffusionstudio/editing-playbook/motion-learned";

export function learnedMotionFieldDefaults(component: LearnedMotion): Record<string, string> {
  return Object.fromEntries(component.parameters.map(parameter => [parameter.id, String(parameter.default)]));
}

/** Keep unfinished numeric fields as text until validation, rather than applying an old value or coercing empty to zero. */
export function learnedMotionFieldValues(component: LearnedMotion, fields: Record<string, string>): Record<string, string | number> {
  const values = Object.fromEntries(component.parameters.map(parameter => {
    const field = Object.hasOwn(fields, parameter.id) ? fields[parameter.id] : String(parameter.default);
    if (parameter.type !== "number") return [parameter.id, field];
    if (!field.trim() || !Number.isFinite(Number(field))) throw new Error(`${parameter.label} needs a finite number.`);
    return [parameter.id, Number(field)];
  }));
  instantiateLearnedMotion(component, { values });
  return values;
}

/** Applying advanced JSON is atomic; invalid fields never replace the current controls. */
export function learnedMotionFieldsFromJson(component: LearnedMotion, text: string): Record<string, string> {
  let values: unknown;
  try { values = JSON.parse(text); } catch { throw new Error("Enter a valid JSON value object."); }
  instantiateLearnedMotion(component, { values: values as Record<string, string | number> });
  const supplied = values as Record<string, string | number>;
  return Object.fromEntries(component.parameters.map(parameter => [parameter.id, String(Object.hasOwn(supplied, parameter.id) ? supplied[parameter.id] : parameter.default)]));
}
